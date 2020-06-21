const ws = require('ws')
const { logger, nStatus, euid } = require('../utils')
const clog = new logger({ head: 'webSocket', level: 'debug' })

const CONFIG_WS = {
  webskPort: 8005,
  webskPath: '/elecV2P'
}

const wsSer = {
  // 服务器 websocket 发送/接收 数据
  send(data){
    wsSend(data)
  },
  recv(msg){
    clog.info('receive message:', msg)
  },
  status: {
    send() {
      if (this.intval) return
      this.intval = setInterval(()=>{
        if (CONFIG_WS.$wss) wsSend({ type: 'elecV2Pstatus', data: { clients: CONFIG_WS.$wss.clients.size, memoryusage: nStatus() }})
        else this.stop()
      }, 3e3)
    },
    stop() {
      if (this.intval) {
        clearInterval(this.intval)
        delete this.intval
      }
    }
  }
}

wsSer.send.func = type => {
  return (data) => {
    wsSend({type, data})
  }
}

function wsSend(data, target){
  if (typeof(data) == "object") {
    data = JSON.stringify(data)
  }
  if (CONFIG_WS.$wss) {
    clog.debug('send client msg:', data)
    CONFIG_WS.$wss.clients.forEach(client=>{
      if (target) {
        if (client.id === target) client.send(data)
      } else if (client.readyState === ws.OPEN) {
        client.send(data)
      }
    })
  } else {
    clog.debug('websocket 暂未连接，无法发送数据：', data)
  }
}

function websocketSer({ port, path }) {
  CONFIG_WS.$wss = new ws.Server({ port, path })
  clog.notify('websocket on port:', port, 'path:', path)
  
  CONFIG_WS.$wss.on('connection', (ws, req)=>{
    const clientip = req.headers['x-forwarded-for'] || req.connection.remoteAddress
    clog.notify(clientip, 'new connection')

    // 初始化 ID
    ws.id = euid()
    ws.send(JSON.stringify({ type: 'euid', data: ws.id }))

    // 发送当前服务器内存使用状态
    wsSer.status.send()

    ws.on('message', msg => {
      try {
        var recvdata = JSON.parse(msg)
      } catch {
        var recvdata = msg
      }
      if (recvdata.type && wsSer.recv[recvdata.type]) {
        // 检查是否设置了特定数据处理函数
        wsSer.recv[recvdata.type](recvdata.data)
      } else {
        wsSer.recv(recvdata)
      }
    })

    ws.on("close", ev=>{
      if(!CONFIG_WS.$wss.clients || CONFIG_WS.$wss.clients.size <= 0) wsSer.status.stop()
      clog.info(clientip, 'disconnected', 'reason: ' + ev)
    })
  })

  CONFIG_WS.$wss.on('error', e=>{
    clog.error('websocket error', e)
  })
}

module.exports = { websocketSer, wsSer, CONFIG_WS }
const { default: makeWASocket, useMultiFileAuthState } = require('@whiskeysockets/baileys')
const qrcode = require('qrcode-terminal')
const P = require('pino')
const yts = require('yt-search')
const fs = require('fs')

// LIMPA SERVIDOR A CADA 1 HORA PRA NÃO TRAVAR
setInterval(() => {
  try {
    if (fs.existsSync('./temp')) fs.rmSync('./temp', { recursive: true, force: true })
  } catch(e) {}
}, 3600000)

// ANTI-BLOQUEIO YOUTUBE
const invidiousServers = ['https://yewtu.be','https://invidious.snopyta.org','https://vid.puffyan.us']
let serverAtual = 0
function proximoServidor() {
  serverAtual = (serverAtual + 1) % invidiousServers.length
  return invidiousServers[serverAtual]
}

async function buscarMusica(nome) {
  try {
    const busca = await yts(nome)
    if (busca.videos.length > 0) return { fonte: 'YouTube', video: busca.videos[0] }
  } catch(e) {}
  try {
    const servidor = proximoServidor()
    const res = await fetch(`${servidor}/api/v1/search?q=${encodeURIComponent(nome)}&type=video`)
    const dados = await res.json()
    if (dados.length > 0) {
      const v = dados[0]
      return { fonte: 'YouTube Alt', video: { title: v.title, url: `https://youtube.com/watch?v=${v.videoId}`, thumbnail: `https://i.ytimg.com/vi/${v.videoId}/hqdefault.jpg`, author: { name: v.author }, timestamp: '---' } }
    }
  } catch(e) {}
  try {
    const res = await fetch(`https://api-v2.soundcloud.com/search/tracks?q=${encodeURIComponent(nome)}&client_id=iZIs9mchVcX5lhVRyQGGAYlNPVldzAoX`)
    const dados = await res.json()
    if (dados.collection.length > 0) {
      const s = dados.collection[0]
      return { fonte: 'SoundCloud', video: { title: s.title, url: s.permalink_url, thumbnail: s.artwork_url, author: { name: s.user.username }, timestamp: '---' } }
    }
  } catch(e) {}
  return null
}

async function start() {
  const { state, saveCreds } = await useMultiFileAuthState('auth')
  const sock = makeWASocket({ logger: P({level:'silent'}), printQRInTerminal: false, auth: state })

  // LIGAÇÃO POR CÓDIGO - MESMO CELULAR
  if (!sock.authState.creds.registered) {
    const numero = '258846296851'
    setTimeout(async () => {
      try {
        const codigo = await sock.requestPairingCode(numero)
        console.log('===============================')
        console.log('TEU CODIGO DE EMPARELHAMENTO:')
        console.log(codigo)
        console.log('===============================')
      } catch(e) { console.log('Erro ao gerar codigo:', e.message) }
    }, 3000)
  }

  sock.ev.on('creds.update', saveCreds)
  sock.ev.on('connection.update', (update) => {
    const { connection } = update
    if(connection === 'open') console.log('EDY BOT ONLINE!')
  })

  sock.ev.on('messages.upsert', async ({messages}) => {
    const m = messages[0]
    if(!m.message || m.key.fromMe) return
    const texto = m.message.conversation || m.message.extendedTextMessage?.text || ''
    const comando = texto.toLowerCase()

    if(comando === '!menu' || comando === 'oi' || comando === 'menu') {
      const msg = await sock.sendMessage(m.key.remoteJid, { text: `🤖 *EDY BOT* 🎵\n\n!play nome da musica - Procurar musica\n!menu - Ver menu\n\nEx: !play Burna Boy City Boys` })
      setTimeout(async () => { try { await sock.sendMessage(m.key.remoteJid, { delete: msg.key }) } catch(e) {} }, 60000)
      return
    }

    if(comando.startsWith('!play')) {
      const musica = texto.slice(5).trim()
      if(!musica) { await sock.sendMessage(m.key.remoteJid, { text: `❌ Manda assim: !play nome da musica` }); return }
      const aviso = await sock.sendMessage(m.key.remoteJid, { text: `🎵 Procurando *${musica}*...` })
      const resultado = await buscarMusica(musica)
      setTimeout(async () => { try { await sock.sendMessage(m.key.remoteJid, { delete: aviso.key }) } catch(e) {} }, 10000)
      if(!resultado) { await sock.sendMessage(m.key.remoteJid, { text: `❌ Não achei em nenhuma fonte. Tenta outro nome.` }); return }
      const v = resultado.video
      const msgFinal = await sock.sendMessage(m.key.remoteJid, {
        image: { url: v.thumbnail },
        caption: `🎵 *${v.title}*\n👤 ${v.author.name}\n⏱️ ${v.timestamp}\n📡 Fonte: ${resultado.fonte}\n\n🔗 Ouvir / Baixar:\n${v.url}\n\n*EDY BOT* 🤖`
      })
      setTimeout(async () => { try { await sock.sendMessage(m.key.remoteJid, { delete: msgFinal.key }) } catch(e) {} }, 120000)
    }
  })
}
start()

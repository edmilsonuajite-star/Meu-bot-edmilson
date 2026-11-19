const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys')
const qrcode = require('qrcode-terminal')
const P = require('pino')
const yts = require('yt-search')
const fs = require('fs')

// LIMPA SERVIDOR A CADA 1 HORA PRA NÃO TRAVAR + LIMPA LOG
setInterval(() => {
  try {
    if (fs.existsSync('./temp')) fs.rmSync('./temp', { recursive: true, force: true })
    if (fs.existsSync('./logs')) fs.rmSync('./logs', { recursive: true, force: true })
    console.clear()
    console.log('Limpeza automatica feita - servidor leve ✅')
  } catch(e) {}
}, 3600000)

// ANTI-BLOQUEIO YOUTUBE - GIRA SERVIDORES / CLOUDFLARE
const invidiousServers = [
  'https://yewtu.be',
  'https://invidious.snopyta.org',
  'https://vid.puffyan.us',
  'https://inv.nadeko.net',
  'https://invidious.privacyredirect.com'
]
let serverAtual = 0
function proximoServidor() {
  serverAtual = (serverAtual + 1) % invidiousServers.length
  return invidiousServers[serverAtual]
}

async function buscarMusica(nome) {
  // 1. TENTA YOUTUBE NORMAL
  try {
    const busca = await yts(nome)
    if (busca.videos.length > 0) return { fonte: 'YouTube', video: busca.videos[0] }
  } catch(e) { console.log('YouTube normal falhou, a tentar alternativo...') }

  // 2. TENTA YOUTUBE POR OUTRO SERVIDOR (FUGE DO BLOQUEIO / CLOUDFLARE)
  for (let i = 0; i < invidiousServers.length; i++) {
    try {
      const servidor = proximoServidor()
      const res = await fetch(`${servidor}/api/v1/search?q=${encodeURIComponent(nome)}&type=video`, {
        headers: { 'User-Agent': 'Mozilla/5.0' }
      })
      const dados = await res.json()
      if (dados.length > 0) {
        const v = dados[0]
        return { fonte: 'YouTube Alt - ' + servidor, video: { title: v.title, url: `https://youtube.com/watch?v=${v.videoId}`, thumbnail: `https://i.ytimg.com/vi/${v.videoId}/hqdefault.jpg`, author: { name: v.author }, timestamp: v.lengthSeconds ? Math.floor(v.lengthSeconds/60)+':'+String(v.lengthSeconds%60).padStart(2,'0') : '---' } }
      }
    } catch(e) {}
  }

  // 3. TENTA SOUNDCLOUD SE YOUTUBE FALHAR TOTAL
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
  const sock = makeWASocket({
    logger: P({level:'silent'}),
    printQRInTerminal: true,
    auth: state,
    browser: ['EDY BOT','Chrome','1.0']
  })

  // LIGAÇÃO SÓ POR QR - SEM NÚMERO, SEM CÓDIGO
  console.log('Escaneia o QR no Railway para conectar o EDY BOT')

  sock.ev.on('creds.update', saveCreds)

  sock.ev.on('connection.update', (update) => {
    const { qr, connection, lastDisconnect } = update
    if (qr) { console.log('ESCANEIA ESSE QR:'); qrcode.generate(qr, {small:true}) }
    if (connection === 'close') {
      const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut
      console.log('Conexao fechada, a reconectar...', shouldReconnect)
      if (shouldReconnect) start()
    } else if (connection === 'open') {
      console.log('EDY BOT ONLINE!')
    }
  })

  sock.ev.on('messages.upsert', async ({messages}) => {
    try {
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
    } catch(e) { console.log('Erro nas mensagens:', e.message) }
  })
}
start()

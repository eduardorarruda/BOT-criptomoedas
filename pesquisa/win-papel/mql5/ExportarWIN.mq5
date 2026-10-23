//+------------------------------------------------------------------+
//| ExportarWIN.mq5 — ZenTrade                                        |
//| Exporta as barras de 5 minutos do mini índice contínuo (WIN$N)    |
//| para MQL5\Files\WIN_M5.csv, no formato "Exportar barras" do MT5.  |
//| Só leitura: não envia ordem nenhuma.                              |
//+------------------------------------------------------------------+
#property strict

input string   Simbolo    = "WIN$N";
input datetime Desde      = D'2015.01.01 00:00';
input string   Arquivo    = "WIN_M5.csv";
input int      Tentativas = 60;   // espera até o servidor mandar o histórico

void Status(const string texto)
  {
   int h = FileOpen("WIN_M5.status", FILE_WRITE | FILE_TXT | FILE_ANSI);
   if(h != INVALID_HANDLE)
     {
      FileWriteString(h, texto + "\r\n");
      FileClose(h);
     }
   Print("ExportarWIN: ", texto);
  }

void OnStart()
  {
   if(!SymbolSelect(Simbolo, true))
     {
      Status("ERRO simbolo " + Simbolo + " nao existe nesta conta");
      return;
     }
   Status("carregando " + Simbolo);
   MqlRates barras[];
   ArraySetAsSeries(barras, false);
   int copiadas = -1, anterior = -2;
   for(int i = 0; i < Tentativas && !IsStopped(); i++)
     {
      copiadas = CopyRates(Simbolo, PERIOD_M5, Desde, TimeCurrent(), barras);
      bool sincronizado = (bool)SeriesInfoInteger(Simbolo, PERIOD_M5, SERIES_SYNCHRONIZED);
      Status(StringFormat("tentativa %d: %d barras, sincronizado=%s", i + 1, copiadas, sincronizado ? "sim" : "nao"));
      if(copiadas > 0 && copiadas == anterior && sincronizado)
         break;
      anterior = copiadas;
      Sleep(3000);
     }
   if(copiadas <= 0)
     {
      Status(StringFormat("ERRO sem barras (CopyRates=%d, erro=%d)", copiadas, GetLastError()));
      return;
     }
   int h = FileOpen(Arquivo, FILE_WRITE | FILE_TXT | FILE_ANSI);
   if(h == INVALID_HANDLE)
     {
      Status(StringFormat("ERRO ao abrir %s (erro=%d)", Arquivo, GetLastError()));
      return;
     }
   FileWriteString(h, "<DATE>\t<TIME>\t<OPEN>\t<HIGH>\t<LOW>\t<CLOSE>\t<TICKVOL>\t<VOL>\t<SPREAD>\r\n");
   for(int i = 0; i < copiadas; i++)
     {
      MqlRates b = barras[i];
      FileWriteString(h, StringFormat("%s\t%s\t%.2f\t%.2f\t%.2f\t%.2f\t%I64d\t%I64d\t%d\r\n",
                                      TimeToString(b.time, TIME_DATE),
                                      TimeToString(b.time, TIME_SECONDS),
                                      b.open, b.high, b.low, b.close,
                                      b.tick_volume, b.real_volume, b.spread));
     }
   FileClose(h);
   Status(StringFormat("OK %d barras de %s a %s, servidor agora %s",
                       copiadas,
                       TimeToString(barras[0].time, TIME_DATE | TIME_MINUTES),
                       TimeToString(barras[copiadas - 1].time, TIME_DATE | TIME_MINUTES),
                       TimeToString(TimeCurrent(), TIME_DATE | TIME_MINUTES)));
  }

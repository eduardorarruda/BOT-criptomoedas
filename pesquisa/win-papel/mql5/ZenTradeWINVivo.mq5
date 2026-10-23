//+------------------------------------------------------------------+
//| ZenTradeWINVivo.mq5 — ZenTrade                                    |
//| Fica rodando: a cada vela de 5 minutos FECHADA do WIN$N, grava    |
//| as últimas velas em MQL5\Files\WIN_M5_vivo.csv (formato MT5) e    |
//| um carimbo em WIN_M5_vivo.status. O ZenTrade importa o arquivo.   |
//| Só leitura: não envia ordem nenhuma.                              |
//+------------------------------------------------------------------+
#property strict

input string Simbolo  = "WIN$N";
input int    Velas    = 300;
input int    EsperaMs = 5000;

void Gravar(const MqlRates &barras[], const int n, const datetime ultima)
  {
   int h = FileOpen("WIN_M5_vivo.tmp", FILE_WRITE | FILE_TXT | FILE_ANSI);
   if(h == INVALID_HANDLE)
     {
      Print("ZenTradeWINVivo: erro ao abrir arquivo ", GetLastError());
      return;
     }
   FileWriteString(h, "<DATE>\t<TIME>\t<OPEN>\t<HIGH>\t<LOW>\t<CLOSE>\t<TICKVOL>\t<VOL>\t<SPREAD>\r\n");
   for(int i = 0; i < n; i++)
     {
      if(barras[i].time > ultima)
         break;
      FileWriteString(h, StringFormat("%s\t%s\t%.2f\t%.2f\t%.2f\t%.2f\t%I64d\t%I64d\t%d\r\n",
                                      TimeToString(barras[i].time, TIME_DATE),
                                      TimeToString(barras[i].time, TIME_SECONDS),
                                      barras[i].open, barras[i].high, barras[i].low, barras[i].close,
                                      barras[i].tick_volume, barras[i].real_volume, barras[i].spread));
     }
   FileClose(h);
   FileMove("WIN_M5_vivo.tmp", 0, "WIN_M5_vivo.csv", FILE_REWRITE);
   int s = FileOpen("WIN_M5_vivo.status", FILE_WRITE | FILE_TXT | FILE_ANSI);
   if(s != INVALID_HANDLE)
     {
      FileWriteString(s, StringFormat("ultima_fechada=%s servidor=%s\r\n",
                                      TimeToString(ultima, TIME_DATE | TIME_MINUTES),
                                      TimeToString(TimeCurrent(), TIME_DATE | TIME_SECONDS)));
      FileClose(s);
     }
  }

void OnStart()
  {
   SymbolSelect(Simbolo, true);
   datetime gravada = 0;
   MqlRates barras[];
   ArraySetAsSeries(barras, false);
   while(!IsStopped())
     {
      int n = CopyRates(Simbolo, PERIOD_M5, 0, Velas, barras);
      if(n > 1)
        {
         // a última barra está em formação até o relógio do servidor passar do fim dela
         datetime agora = TimeCurrent();
         datetime ultima = (barras[n - 1].time + 300 <= agora) ? barras[n - 1].time : barras[n - 2].time;
         if(ultima != gravada)
           {
            Gravar(barras, n, ultima);
            gravada = ultima;
           }
        }
      Sleep(EsperaMs);
     }
  }

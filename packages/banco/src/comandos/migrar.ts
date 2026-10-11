import { z } from "zod";
import { migrar } from "../migrar.js";

// `pnpm --filter @zentrade/banco migrar`: aplica as migrações pendentes em DATABASE_URL.
const url = z
  .string({ error: "defina DATABASE_URL antes de migrar (veja .env.example)" })
  .safeParse(process.env.DATABASE_URL);

if (!url.success) {
  console.error(url.error.issues[0]?.message);
  process.exitCode = 1;
} else {
  try {
    await migrar(url.data);
    process.stdout.write("migrações aplicadas\n");
  } catch (erro) {
    console.error(`falha ao migrar: ${(erro as Error).message}`);
    process.exitCode = 1;
  }
}

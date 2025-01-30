import { DataSource } from "typeorm";
import { join } from "path";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env" });

export const connectionSource = new DataSource({
  type: "postgres",
  host: process.env.POSTGRES_HOST,
  port: parseInt(process.env.POSTGRES_PORT, 10),
  username: process.env.POSTGRES_USERNAME,
  password: process.env.POSTGRES_PASSWORD,
  database: process.env.POSTGRES_DB,
  logging: true,
  entities: [__dirname + "/../**/*.entity{.ts,.js}"],
  migrations: [join(__dirname, "/../", "database/migrations/**/*{.ts,.js}")],
  synchronize: false,
  migrationsTableName: "typeorm_migrations",
  migrationsRun: false,
});

import { Module } from "@nestjs/common";
import { TelegramService } from "./telegram.service";
import { TelegramController } from "./telegram.controller";
import { TypeOrmModule } from "@nestjs/typeorm";
import { TelegramUser } from "./entity/telegram-user.entity";
import { OpenAIModule } from "../openai/openai.module";
import { TransactionModule } from "../transaction/transaction.module";

@Module({
  imports: [
    TypeOrmModule.forFeature([TelegramUser]),
    OpenAIModule,
    TransactionModule,
  ],
  providers: [TelegramService],
  controllers: [TelegramController],
  exports: [TelegramService],
})
export class TelegramModule {}

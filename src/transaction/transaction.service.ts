import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository, Like, Between } from "typeorm";
import { Transaction } from "./entity/transaction.entity";

@Injectable()
export class TransactionService {
  private readonly logger = new Logger(TransactionService.name);

  constructor(
    @InjectRepository(Transaction)
    private transactionRepository: Repository<Transaction>,
  ) {}

  async create(data: {
    chatId: string;
    userId: string;
    amount: number;
    location: string;
    fulltext: string;
    date: string;
    time: string;
    category: string;
  }): Promise<Transaction> {
    const transaction = this.transactionRepository.create(data);
    return await this.transactionRepository.save(transaction);
  }

  async findAll(): Promise<Transaction[]> {
    return await this.transactionRepository.find();
  }

  async findByChatId(chatId: string): Promise<Transaction[]> {
    return await this.transactionRepository.find({ where: { chatId } });
  }

  async findByUserId(userId: string): Promise<Transaction[]> {
    return await this.transactionRepository.find({ where: { userId } });
  }

  async update(
    id: number,
    transactionData: Partial<Transaction>,
  ): Promise<Transaction> {
    await this.transactionRepository.update(id, transactionData);
    return await this.transactionRepository.findOne({ where: { id } });
  }

  async delete(id: number): Promise<void> {
    await this.transactionRepository.delete(id);
  }

  async findTodayTransactions(userId: string): Promise<Transaction[]> {
    const today = new Date();
    const todayString = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

    return this.transactionRepository.find({
      where: {
        userId,
        date: todayString,
      },
    });
  }

  async findTransactionsByDate(
    userId: string,
    date: string,
  ): Promise<Transaction[]> {
    return this.transactionRepository.find({
      where: {
        userId,
        date: date,
      },
    });
  }

  async findTransactionsByMonth(
    userId: string,
    year: number,
    month: number,
  ): Promise<Transaction[]> {
    const monthStr = String(month + 1).padStart(2, "0");
    const datePrefix = `${year}-${monthStr}-`;

    return this.transactionRepository.find({
      where: {
        userId,
        date: Like(`${datePrefix}%`),
      },
    });
  }

  async findByChatIdAndUserId(
    chatId: string,
    userId: string,
  ): Promise<Transaction | null> {
    return this.transactionRepository.findOne({
      where: {
        chatId,
        userId,
      },
    });
  }

  async findTransactionsByDateRange(
    userId: string,
    startDate: string,
    endDate: string,
  ): Promise<Transaction[]> {
    return this.transactionRepository.find({
      where: {
        userId,
        date: Between(startDate, endDate),
      },
      order: {
        date: "ASC",
      },
    });
  }

  async findYesterdayTransactions(userId: string): Promise<Transaction[]> {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayString = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, "0")}-${String(yesterday.getDate()).padStart(2, "0")}`;

    return this.transactionRepository.find({
      where: {
        userId,
        date: yesterdayString,
      },
    });
  }
}

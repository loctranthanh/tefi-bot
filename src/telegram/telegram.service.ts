import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Telegraf, Context } from "telegraf";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { TelegramUser } from "./entity/telegram-user.entity";
import { OpenAIService } from "../openai/openai.service";
import { TransactionService } from "../transaction/transaction.service";
import { Transaction } from "src/transaction/entity/transaction.entity";
import * as ffmpeg from "fluent-ffmpeg";
import * as ffmpegInstaller from "@ffmpeg-installer/ffmpeg";
import * as fs from "fs";
import * as path from "path";
import fetch from "node-fetch";

@Injectable()
export class TelegramService implements OnModuleInit {
  private readonly logger = new Logger(TelegramService.name);
  private bot: Telegraf;

  constructor(
    private configService: ConfigService,
    @InjectRepository(TelegramUser)
    private telegramUserRepository: Repository<TelegramUser>,
    private openaiService: OpenAIService,
    private transactionService: TransactionService,
  ) {
    this.bot = new Telegraf(
      this.configService.get<string>("TELEGRAM_BOT_TOKEN"),
    );
    ffmpeg.setFfmpegPath(ffmpegInstaller.path);
  }

  private async registerUser(ctx: Context) {
    const chatId = this.getUserId(ctx);
    if (!chatId) return null;

    let user = await this.telegramUserRepository.findOne({ where: { chatId } });

    if (!user) {
      user = new TelegramUser();
      user.chatId = chatId;

      if (ctx.chat?.type === "private") {
        user.username = ctx.from?.username;
        user.firstName = ctx.from?.first_name;
        user.lastName = ctx.from?.last_name;
      } else if (
        ctx.chat?.type === "group" ||
        ctx.chat?.type === "supergroup"
      ) {
        user.groupName = ctx.chat.title;
      }

      await this.telegramUserRepository.save(user);
      this.logger.log(`New user registered: ${JSON.stringify(user)}`);
    }

    return user;
  }

  async startCommand(ctx: Context) {
    const user = await this.registerUser(ctx);
    if (!user) {
      return ctx.reply("Error registering user.");
    }

    const welcomeMessage =
      ctx.chat?.type === "private"
        ? `Welcome ${user.firstName || user.username || "user"}!`
        : `Hello! This group "${user.groupName}" has been registered.`;

    return ctx.reply(welcomeMessage);
  }

  async helpCommand(ctx: Context) {
    this.logger.debug(`Help command received ${JSON.stringify(ctx.message)}`);
    const helpMessage =
      `🤖 Xin chào! Đây là danh sách các lệnh có sẵn:\n\n` +
      `📝 Ghi nhận chi tiêu:\n` +
      `- Nhắn tin trực tiếp số tiền và mô tả\n` +
      `- Gửi ảnh hóa đơn\n` +
      `- Gửi tin nhắn thoại\n\n` +
      `📊 Các lệnh thống kê:\n` +
      `/report - Xem chi tiêu từ đầu tháng đến nay\n` +
      `/date [dd/MM/yyyy] - Xem chi tiêu theo ngày\n` +
      `/month [MM/yyyy] - Xem chi tiêu theo tháng\n\n` +
      `✏️ Quản lý chi tiêu:\n` +
      `/update - Cập nhật chi tiêu (reply tin nhắn cần sửa)\n` +
      `/delete - Xóa chi tiêu (reply tin nhắn cần xóa)\n` +
      `/cancel - Giống lệnh delete\n\n` +
      `🔄 Khác:\n` +
      `/start - Đăng ký sử dụng bot\n` +
      `/help - Hiển thị trợ giúp này\n\n` +
      `💡 Ví dụ ghi nhận chi tiêu:\n` +
      `- "50k ăn phở"\n` +
      `- "Trưa nay ăn cơm 35k"\n` +
      `- "Đổ xăng 200k"\n`;

    return ctx.reply(helpMessage);
  }

  private async getDailyTotalsMessage(userId: string): Promise<string> {
    const todayTransactions =
      await this.transactionService.findTodayTransactions(userId);
    const yesterdayTransactions =
      await this.transactionService.findYesterdayTransactions(userId);

    const todayTotal = todayTransactions.reduce(
      (sum, trans) => sum + trans.amount,
      0,
    );
    const yesterdayTotal = yesterdayTransactions.reduce(
      (sum, trans) => sum + trans.amount,
      0,
    );

    return (
      `\n\n📅 Tổng chi tiêu:\n` +
      `- Hôm nay: ${todayTotal.toLocaleString()}đ\n` +
      `- Hôm qua: ${yesterdayTotal.toLocaleString()}đ`
    );
  }

  async handleExpenseMessage(ctx: Context, text: string) {
    try {
      const jsonResponse = await this.openaiService.extractExpenseDetails(text);
      const expenseData = JSON.parse(jsonResponse);

      const transaction = await this.transactionService.create({
        chatId: ctx.message?.message_id?.toString(),
        userId: ctx.from?.id.toString(),
        amount: expenseData.amount,
        location: expenseData.location,
        fulltext: expenseData.full_message,
        date: expenseData.date,
        time: expenseData.time,
        category: expenseData.category, // Add this line
      });

      const dailyTotals = await this.getDailyTotalsMessage(
        ctx.from?.id.toString(),
      );
      await ctx.reply(
        `✅ Đã ghi nhận chi tiêu:\n` +
          `💰 ${expenseData.amount.toLocaleString()}đ\n` +
          `📍 ${expenseData.location || "Không có địa điểm"}\n` +
          `🏷️ ${expenseData.category || "Khác"}\n` +
          `📅 ${expenseData.date}\n` +
          `⏰ ${expenseData.time}\n` +
          `💭 ${expenseData.judgment || "Hãy chi tiêu thông minh nhé!"}` +
          dailyTotals,
      );
      return transaction;
    } catch (error) {
      this.logger.error("Error processing expense message:", error);
      await ctx.reply("❌ Có lỗi xảy ra khi xử lý chi tiêu.");
      return null;
    }
  }

  async handleExpenseImage(ctx: Context, photo: any) {
    try {
      // Get the largest photo (best quality)
      const fileId = photo[photo.length - 1].file_id;
      const file = await ctx.telegram.getFile(fileId);
      const fileUrl = `https://api.telegram.org/file/bot${this.configService.get<string>("TELEGRAM_BOT_TOKEN")}/${file.file_path}`;

      await ctx.reply("🔍 Đang phân tích hóa đơn...");

      const jsonResponse =
        await this.openaiService.analyzeExpenseImage(fileUrl);
      const expenseData = JSON.parse(jsonResponse);

      const transaction = await this.transactionService.create({
        chatId: ctx.message?.message_id?.toString(),
        userId: ctx.from?.id.toString(),
        amount: expenseData.amount,
        location: expenseData.location,
        fulltext: "Image analysis",
        date: expenseData.date || this.getCurrentDate(),
        time: expenseData.time || this.getCurrentTime(),
        category: expenseData.category,
      });

      const dailyTotals = await this.getDailyTotalsMessage(
        ctx.from?.id.toString(),
      );
      await ctx.reply(
        `✅ Đã ghi nhận chi tiêu từ hình ảnh:\n` +
          `💰 ${expenseData.amount.toLocaleString()}đ\n` +
          `📍 ${expenseData.location || "Không có địa điểm"}\n` +
          `🏷️ ${expenseData.category || "Khác"}\n` +
          `📅 ${expenseData.date || this.getCurrentDate()}\n` +
          `⏰ ${expenseData.time || this.getCurrentTime()}\n` +
          `💭 Hãy chi tiêu thông minh nhé!` +
          dailyTotals,
      );
      return transaction;
    } catch (error) {
      this.logger.error("Error processing expense image:", error);
      await ctx.reply("❌ Có lỗi xảy ra khi xử lý hình ảnh.");
      return null;
    }
  }

  private async downloadVoiceMessage(fileUrl: string): Promise<string> {
    const response = await fetch(fileUrl);
    const buffer = await response.buffer();

    const tempDir = path.join(process.cwd(), "temp");
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir);
    }

    const oggPath = path.join(tempDir, `voice_${Date.now()}.ogg`);
    const mp3Path = path.join(tempDir, `voice_${Date.now()}.mp3`);

    fs.writeFileSync(oggPath, buffer);

    return new Promise((resolve, reject) => {
      ffmpeg(oggPath)
        .toFormat("mp3")
        .save(mp3Path)
        .on("end", () => {
          fs.unlinkSync(oggPath); // Clean up ogg file
          resolve(mp3Path);
        })
        .on("error", (err) => {
          fs.unlinkSync(oggPath); // Clean up ogg file
          reject(err);
        });
    });
  }

  async handleVoiceMessage(ctx: Context, voice: any) {
    try {
      await ctx.reply("🎤 Đang xử lý tin nhắn thoại...");

      const file = await ctx.telegram.getFile(voice.file_id);
      const fileUrl = `https://api.telegram.org/file/bot${this.configService.get<string>("TELEGRAM_BOT_TOKEN")}/${file.file_path}`;

      const mp3Path = await this.downloadVoiceMessage(fileUrl);

      // Convert audio to text using OpenAI's Whisper model
      const transcribedText = await this.openaiService.transcribeAudio(mp3Path);

      // Clean up the MP3 file
      fs.unlinkSync(mp3Path);

      await ctx.reply(`🗣️ Nội dung: ${transcribedText}`);

      // Process the transcribed text as an expense and get the daily totals
      const result = await this.handleExpenseMessage(ctx, transcribedText);
      return result;
    } catch (error) {
      this.logger.error("Error processing voice message:", error);
      await ctx.reply("❌ Có lỗi xảy ra khi xử lý tin nhắn thoại.");
      return null;
    }
  }

  private getCurrentDate(): string {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  }

  private getCurrentTime(): string {
    const now = new Date();
    return `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  }

  private parseDate(dateStr: string): Date | null {
    const today = new Date();
    const parts = dateStr.split("/");

    try {
      if (parts.length === 1) {
        // Format: dd
        const day = parseInt(parts[0]);
        if (isNaN(day) || day < 1 || day > 31) return null;
        return new Date(today.getFullYear(), today.getMonth(), day);
      } else if (parts.length === 2) {
        // Format: dd/MM
        const day = parseInt(parts[0]);
        const month = parseInt(parts[1]) - 1;
        if (
          isNaN(day) ||
          isNaN(month) ||
          day < 1 ||
          day > 31 ||
          month < 0 ||
          month > 11
        )
          return null;
        return new Date(today.getFullYear(), month, day);
      } else if (parts.length === 3) {
        // Format: dd/MM/yyyy
        const day = parseInt(parts[0]);
        const month = parseInt(parts[1]) - 1;
        const year = parseInt(parts[2]);
        if (
          isNaN(day) ||
          isNaN(month) ||
          isNaN(year) ||
          day < 1 ||
          day > 31 ||
          month < 0 ||
          month > 11
        )
          return null;
        return new Date(year, month, day);
      }
    } catch (error) {
      return null;
    }
    return null;
  }

  private getUserId(ctx: Context): string | null {
    return ctx.chat?.id.toString();
  }

  async dateCommand(ctx: Context) {
    const userId = this.getUserId(ctx);
    if (!userId) {
      return ctx.reply("❌ Không thể xác định người dùng.");
    }

    try {
      // Get date parameter from command
      const args = (ctx.message as any).text.split(" ");
      const dateParam = args[1]; // Get the first argument after command
      let queryDate: Date;

      if (!dateParam) {
        // If no date parameter, use today
        queryDate = new Date();
      } else {
        const parsedDate = this.parseDate(dateParam);
        if (!parsedDate) {
          return ctx.reply(
            "❌ Định dạng ngày không hợp lệ. Sử dụng: dd hoặc dd/MM hoặc dd/MM/yyyy",
          );
        }
        queryDate = parsedDate;
      }

      const dateString = `${queryDate.getFullYear()}-${String(queryDate.getMonth() + 1).padStart(2, "0")}-${String(queryDate.getDate()).padStart(2, "0")}`;
      const transactions = await this.transactionService.findTransactionsByDate(
        userId,
        dateString,
      );

      if (transactions.length === 0) {
        return ctx.reply(
          `Không có khoản chi tiêu nào vào ngày ${queryDate.toLocaleDateString("vi-VN")}`,
        );
      }

      let totalAmount = 0;
      const categoryStats = new Map();

      transactions.forEach((trans) => {
        totalAmount += trans.amount;
        const category = trans.category || "Khác";
        categoryStats.set(
          category,
          (categoryStats.get(category) || 0) + trans.amount,
        );
      });

      let message = `📊 Thống kê chi tiêu ngày ${queryDate.toLocaleDateString("vi-VN")}:\n\n`;
      message += `💰 Tổng chi tiêu: ${totalAmount.toLocaleString()}đ\n\n`;
      message += "🏷️ Chi tiết theo danh mục:\n";

      categoryStats.forEach((amount, category) => {
        message += `- ${category}: ${amount.toLocaleString()}đ\n`;
      });

      return ctx.reply(message);
    } catch (error) {
      this.logger.error("Error getting date statistics:", error);
      return ctx.reply("❌ Có lỗi xảy ra khi lấy thống kê.");
    }
  }

  private parseMonth(
    monthStr?: string,
  ): { year: number; month: number } | null {
    try {
      const today = new Date();
      if (!monthStr) {
        return { year: today.getFullYear(), month: today.getMonth() };
      }

      const parts = monthStr.split("/");
      if (parts.length === 1) {
        // Format: MM
        const month = parseInt(parts[0]) - 1;
        if (isNaN(month) || month < 0 || month > 11) return null;
        return { year: today.getFullYear(), month };
      } else if (parts.length === 2) {
        // Format: MM/YYYY
        const month = parseInt(parts[0]) - 1;
        const year = parseInt(parts[1]);
        if (isNaN(month) || isNaN(year) || month < 0 || month > 11) return null;
        return { year, month };
      }
    } catch (error) {
      return null;
    }
    return null;
  }

  async monthCommand(ctx: Context) {
    const userId = this.getUserId(ctx);
    if (!userId) {
      return ctx.reply("❌ Không thể xác định người dùng.");
    }

    try {
      const args = (ctx.message as any).text.split(" ");
      const monthParam = args[1];
      const dateInfo = this.parseMonth(monthParam);

      if (!dateInfo) {
        return ctx.reply(
          "❌ Định dạng tháng không hợp lệ. Sử dụng: /month hoặc /month MM hoặc /month MM/YYYY",
        );
      }

      const transactions =
        await this.transactionService.findTransactionsByMonth(
          userId,
          dateInfo.year,
          dateInfo.month,
        );

      if (transactions.length === 0) {
        return ctx.reply(
          `Không có khoản chi tiêu nào trong tháng ${dateInfo.month + 1}/${dateInfo.year}`,
        );
      }

      let totalAmount = 0;
      const categoryStats = new Map();

      transactions.forEach((trans) => {
        totalAmount += trans.amount;
        const category = trans.category || "Khác";
        categoryStats.set(
          category,
          (categoryStats.get(category) || 0) + trans.amount,
        );
      });

      let message = `📊 Thống kê chi tiêu tháng ${dateInfo.month + 1}/${dateInfo.year}:\n\n`;
      message += `💰 Tổng chi tiêu: ${totalAmount.toLocaleString()}đ\n\n`;
      message += "🏷️ Chi tiết theo danh mục:\n";

      categoryStats.forEach((amount, category) => {
        message += `- ${category}: ${amount.toLocaleString()}đ\n`;
      });

      return ctx.reply(message);
    } catch (error) {
      this.logger.error("Error getting month statistics:", error);
      return ctx.reply("❌ Có lỗi xảy ra khi lấy thống kê.");
    }
  }

  async deleteCommand(ctx: Context) {
    try {
      const userId = this.getUserId(ctx);
      if (!userId) {
        return ctx.reply("❌ Không thể xác định người dùng.");
      }

      // Check if message is a reply
      const repliedToMessage = (ctx.message as any)?.reply_to_message;
      if (!repliedToMessage) {
        return ctx.reply("❌ Vui lòng reply tin nhắn chi tiêu cần xóa.");
      }

      const chatId = repliedToMessage.message_id.toString();
      const transaction = await this.transactionService.findByChatIdAndUserId(
        chatId,
        userId,
      );

      if (!transaction) {
        return ctx.reply(
          "❌ Không tìm thấy chi tiêu này hoặc bạn không có quyền xóa.",
        );
      }

      await this.transactionService.delete(transaction.id);
      return ctx.reply(
        `✅ Đã xóa khoản chi tiêu ${transaction.amount.toLocaleString()}đ`,
      );
    } catch (error) {
      this.logger.error("Error deleting transaction:", error);
      return ctx.reply("❌ Có lỗi xảy ra khi xóa chi tiêu.");
    }
  }

  async updateCommand(ctx: Context) {
    try {
      const userId = this.getUserId(ctx);
      if (!userId) {
        return ctx.reply("❌ Không thể xác định người dùng.");
      }

      // Check if message is a reply
      const repliedToMessage = (ctx.message as any)?.reply_to_message;
      if (!repliedToMessage) {
        return ctx.reply(
          "❌ Vui lòng reply tin nhắn chi tiêu cần cập nhật kèm thông tin mới.",
        );
      }

      const chatId = repliedToMessage.message_id.toString();
      const transaction = await this.transactionService.findByChatIdAndUserId(
        chatId,
        userId,
      );

      if (!transaction) {
        return ctx.reply(
          "❌ Không tìm thấy chi tiêu này hoặc bạn không có quyền cập nhật.",
        );
      }

      let expenseData;
      if ("photo" in ctx.message) {
        // Handle image update
        const photo = ctx.message.photo;
        const fileId = photo[photo.length - 1].file_id;
        const file = await ctx.telegram.getFile(fileId);
        const fileUrl = `https://api.telegram.org/file/bot${this.configService.get<string>("TELEGRAM_BOT_TOKEN")}/${file.file_path}`;

        await ctx.reply("🔍 Đang phân tích hóa đơn mới...");
        const jsonResponse =
          await this.openaiService.analyzeExpenseImage(fileUrl);
        expenseData = JSON.parse(jsonResponse);
      } else if ("text" in ctx.message) {
        // Handle text update
        const text = ctx.message.text.replace("/update", "").trim();
        if (!text) {
          return ctx.reply("❌ Vui lòng nhập thông tin cần cập nhật.");
        }
        const jsonResponse =
          await this.openaiService.extractExpenseDetails(text);
        expenseData = JSON.parse(jsonResponse);
      } else {
        return ctx.reply("❌ Không hỗ trợ định dạng này.");
      }

      // Update transaction with new data, only include fields that have values
      const updateData: Partial<Transaction> = {};

      if (
        expenseData.amount !== undefined &&
        expenseData.amount !== null &&
        expenseData.amount > 0
      ) {
        updateData.amount = expenseData.amount;
      }
      if (expenseData.location) {
        updateData.location = expenseData.location;
      }
      if (expenseData.category) {
        updateData.category = expenseData.category;
      }
      if (expenseData.date) {
        updateData.date = expenseData.date;
      }
      if (expenseData.time) {
        updateData.time = expenseData.time;
      }

      const updatedTransaction = await this.transactionService.update(
        transaction.id,
        updateData,
      );

      await ctx.reply(
        `✅ Đã cập nhật chi tiêu:\n` +
          `💰 ${updatedTransaction.amount.toLocaleString()}đ\n` +
          `📍 ${updatedTransaction.location || "Không có địa điểm"}\n` +
          `🏷️ ${updatedTransaction.category || "Khác"}\n` +
          `📅 ${updatedTransaction.date}\n` +
          `⏰ ${updatedTransaction.time}\n` +
          `💭 ${expenseData.judgment || "Hãy chi tiêu thông minh nhé!"}`,
      );
    } catch (error) {
      this.logger.error("Error updating transaction:", error);
      return ctx.reply("❌ Có lỗi xảy ra khi cập nhật chi tiêu.");
    }
  }

  async reportCommand(ctx: Context) {
    const userId = this.getUserId(ctx);
    if (!userId) {
      return ctx.reply("❌ Không thể xác định người dùng.");
    }

    try {
      const today = new Date();
      const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);

      const startDate = `${startOfMonth.getFullYear()}-${String(startOfMonth.getMonth() + 1).padStart(2, "0")}-${String(startOfMonth.getDate()).padStart(2, "0")}`;
      const endDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

      const transactions =
        await this.transactionService.findTransactionsByDateRange(
          userId,
          startDate,
          endDate,
        );

      if (transactions.length === 0) {
        return ctx.reply("Không có khoản chi tiêu nào trong tháng này.");
      }

      // Group transactions by date
      const dailyStats = new Map();
      let totalMonthAmount = 0;

      transactions.forEach((trans) => {
        if (!dailyStats.has(trans.date)) {
          dailyStats.set(trans.date, {
            total: 0,
            categories: new Map(),
          });
        }

        const dayStats = dailyStats.get(trans.date);
        const amount = trans.amount;
        const category = trans.category || "Khác";

        dayStats.total += amount;
        dayStats.categories.set(
          category,
          (dayStats.categories.get(category) || 0) + amount,
        );
        totalMonthAmount += amount;
      });

      // Format the report
      let message = `📊 Báo cáo chi tiêu tháng ${today.getMonth() + 1}/${today.getFullYear()}\n\n`;
      message += `💰 Tổng chi tiêu: ${totalMonthAmount.toLocaleString()}đ\n\n`;
      message += `📅 Chi tiết theo ngày:\n\n`;

      for (const [date, stats] of dailyStats) {
        const dateObj = new Date(date);
        message += `📌 ${dateObj.toLocaleDateString("vi-VN")}\n`;
        message += `Tổng: ${stats.total.toLocaleString()}đ\n`;

        for (const [category, amount] of stats.categories) {
          message += `- ${category}: ${amount.toLocaleString()}đ\n`;
        }
        message += "\n";
      }

      return ctx.reply(message);
    } catch (error) {
      this.logger.error("Error generating report:", error);
      return ctx.reply("❌ Có lỗi xảy ra khi tạo báo cáo.");
    }
  }

  async onModuleInit() {
    this.bot.command("start", this.startCommand.bind(this));
    this.bot.command("help", this.helpCommand.bind(this));
    this.bot.command("date", this.dateCommand.bind(this)); // Add this line
    this.bot.command("month", this.monthCommand.bind(this));
    this.bot.command("delete", this.deleteCommand.bind(this));
    this.bot.command("cancel", this.deleteCommand.bind(this)); // Alias for delete
    this.bot.command("update", this.updateCommand.bind(this));
    this.bot.command("report", this.reportCommand.bind(this));

    this.bot.on("message", async (ctx) => {
      this.logger.debug(`Received message: ${JSON.stringify(ctx.message)}`);

      if ("photo" in ctx.message) {
        await this.handleExpenseImage(ctx, ctx.message.photo);
        return;
      }

      if ("voice" in ctx.message) {
        await this.handleVoiceMessage(ctx, ctx.message.voice);
        return;
      }

      const text = "text" in ctx.message ? ctx.message.text : undefined;

      if (!text || text.startsWith("/")) {
        return; // Ignore commands
      }

      await this.handleExpenseMessage(ctx, text);
    });

    await this.bot.launch();
  }

  async getUserByChatId(chatId: string): Promise<TelegramUser | null> {
    return this.telegramUserRepository.findOne({ where: { chatId } });
  }

  async sendMessage(chatId: number, message: string) {
    return this.bot.telegram.sendMessage(chatId, message);
  }
}

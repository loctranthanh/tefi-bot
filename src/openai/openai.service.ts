import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import OpenAI from "openai";
import * as fs from "fs";

@Injectable()
export class OpenAIService {
  private readonly openai: OpenAI;
  private readonly logger = new Logger(OpenAIService.name);
  private readonly model: string;

  constructor(private configService: ConfigService) {
    this.openai = new OpenAI({
      apiKey: this.configService.get<string>("OPENAI_API_KEY"),
    });
    this.model = this.configService.get<string>("OPENAI_MODEL");
  }

  async extractExpenseDetails(message: string) {
    this.logger.log(`Extracting expense details from message: ${message}`);
    const prompt = `
      Bạn là một AI giúp phân tích tin nhắn chi tiêu. Hãy trích xuất thông tin sau dưới dạng JSON:
      - "amount": số tiền (luôn là số nguyên, tính theo VND, ví dụ: "20k" => 20000)
      - "location": địa điểm (nếu có)
      - "category": loại chi tiêu (nếu có) chỉ gồm "mua sắm", "ăn uống", "đi lại", "giải trí", "dịch vụ", "sức khoẻ", "học vấn", "cho vay", "quà tặng", "khác"
      - "full_message": nội dung tin nhắn gốc
      - "date": là ngày giao dịch, format yyyy-MM-dd nếu không đề cập thì trả về null
      - "time": là thời điểm giao dịch, format HH:mm:ss, nếu đề cập buổi sáng là 08:00:00, nếu đề cập trưa là 12:00:00, nếu đề cập tối là 20:00:00, nếu không đề cập thì trả về null
      - "judgment": là một câu nhận xét ngẫu nhiên để giúp bạn tiết kiệm chi tiêu.

      Ví dụ đầu vào: "20k tiền đi chợ"
      Đầu ra mong muốn:
      {
        "amount": 20000,
        "location": "chợ",
        "category": "mua sắm",
        "full_message": "20k tiền đi chợ",
        "date": null,
        "time": null,
        "judgment": "Chi tiêu mạnh tay quá, nhớ để dành tiền cho tương lai!"
      }

      Dữ liệu đầu vào: "${message}"
    `;

    let res = await this.generateResponse(prompt);
    const parsed = JSON.parse(res);
    if (!parsed.date) {
      parsed.date = new Date().toISOString().split('T')[0];
    }
    if (!parsed.time) {
      parsed.time = new Date().toTimeString().split(' ')[0];
    }
    res = JSON.stringify(parsed);
    this.logger.log(`Extracted expense details: ${res}`);
    return res;
  }

  async generateResponse(prompt: string): Promise<string> {
    try {
      const completion = await this.openai.chat.completions.create({
        messages: [{ role: "user", content: prompt }],
        model: this.model,
        response_format: { type: "json_object" },
      });

      return completion.choices[0]?.message?.content || "No response generated";
    } catch (error) {
      this.logger.error("OpenAI API Error:", error);
      return "Sorry, I encountered an error processing your request.";
    }
  }

  async analyzeExpenseImage(imageUrl: string): Promise<string> {
    try {
      const response = await this.openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: `Đây là một hóa đơn hoặc màn hình thanh toán. Hãy phân tích và trích xuất các thông tin sau dưới dạng JSON:
                - "amount": số tiền (luôn là số nguyên, tính theo VND, ví dụ: "20k" => 20000)
                - "location": địa điểm (nếu có)
                - "category": loại chi tiêu (nếu có) chỉ gồm "mua sắm", "ăn uống", "đi lại", "giải trí", "dịch vụ", "sức khoẻ", "học vấn", "cho vay", "quà tặng", "khác"
                - "full_message": nội dung tin nhắn gốc
                - "date": là ngày giao dịch, format yyyy-MM-dd nếu không đề cập thì trả về null
                - "time": là thời điểm giao dịch, format HH:mm:ss, nếu đề cập buổi sáng là 08:00:00, nếu đề cập trưa là 12:00:00, nếu đề cập tối là 20:00:00, nếu không đề cập thì trả về null
                - "judgment": là một câu nhận xét ngẫu nhiên để giúp bạn tiết kiệm chi tiêu.
          
                Ví dụ đầu vào: "20k tiền đi chợ"
                Đầu ra mong muốn:
                {
                  "amount": 20000,
                  "location": "chợ",
                  "category": "mua sắm",
                  "full_message": "20k tiền đi chợ",
                  "date": null,
                  "time": null,
                  "judgment": "Chi tiêu mạnh tay quá, nhớ để dành tiền cho tương lai!"
                }
              `},
              {
                type: "image_url",
                image_url: { url: imageUrl },
              },
            ],
          },
        ],
        max_tokens: 500,
        response_format: { type: "json_object" },
      });

      this.logger.log(
        `Analyzed image with OpenAI: ${JSON.stringify(response.choices[0]?.message?.content)}`,
      );

      return response.choices[0]?.message?.content || "{}";
    } catch (error) {
      this.logger.error("Error analyzing image with OpenAI:", error);
      throw error;
    }
  }

  async transcribeAudio(audioFilePath: string): Promise<string> {
    try {
      const audioStream = fs.createReadStream(audioFilePath);

      const response = await this.openai.audio.transcriptions.create({
        file: audioStream,
        model: "whisper-1",
        language: "vi", // Vietnamese
        temperature: 0.2, // Controls randomness
      });

      return response.text;
    } catch (error) {
      this.logger.error("Error transcribing audio:", error);
      throw error;
    }
  }
}

# Telfine - Telegram Finance Assistant

A smart Telegram bot that helps users track and manage their daily expenses using natural language processing and AI.

## Features

- 💬 Natural Language Processing for expense tracking
- 📸 OCR Receipt scanning and processing
- 🎤 Voice message expense recording
- 📊 Detailed financial reports and analytics
- 🗂 Auto-categorization of expenses
- 📅 Daily and monthly expense summaries

## Tech Stack

- Node.js & NestJS
- PostgreSQL & TypeORM
- OpenAI GPT & Whisper API
- Telegram Bot API
- FFmpeg for audio processing

## Prerequisites

- Node.js 18+
- PostgreSQL 12+
- FFmpeg
- OpenAI API key
- Telegram Bot Token

## Installation

1. Clone the repository:
```bash
git clone https://github.com/loctranthanh/tefi-bot.git
cd tefi-bot
```

2. Install dependencies:
```bash
npm install
```

3. Configure environment variables:
```bash
cp .env.example .env
# Edit .env with your configuration
```

4. Run database migrations:
```bash
npm run migrate
```

5. Start the application:
```bash
# Development
npm run start:dev

# Production
npm run build
npm run start:prod
```

## Usage

### Bot Commands

- `/start` - Register and start using the bot
- `/help` - Show available commands
- `/report` - View current month's expenses
- `/date [dd/MM/yyyy]` - View expenses by date
- `/month [MM/yyyy]` - View expenses by month
- `/update` - Update expense entry (reply to message)
- `/delete` or `/cancel` - Delete expense entry (reply to message)

### Expense Recording

- Send text messages with expense details
- Send photos of receipts
- Send voice messages describing expenses

## Development

### Available Scripts

- `npm run build` - Build the application
- `npm run format` - Format code with Prettier
- `npm run start:dev` - Start in development mode
- `npm run start:debug` - Start in debug mode
- `npm run lint` - Run ESLint
- `npm test` - Run tests
- `npm run migration:create` - Create new migration
- `npm run migrate` - Run migrations
- `npm run migration:down` - Revert last migration

### Project Structure

```
src/
├── database/       # Database migrations and configurations
├── telegram/       # Telegram bot module
├── openai/         # OpenAI integration module
├── transaction/    # Transaction management module
└── shared/        # Shared utilities and interfaces
```

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Acknowledgments

- [Telegraf](https://github.com/telegraf/telegraf) for the Telegram Bot framework
- [OpenAI](https://openai.com) for AI capabilities
- [NestJS](https://nestjs.com) for the awesome framework

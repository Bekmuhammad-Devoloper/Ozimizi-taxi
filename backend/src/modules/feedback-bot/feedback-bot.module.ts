import { Module } from '@nestjs/common';
import { FeedbackBotService } from './feedback-bot.service';

/**
 * Standalone Telegram bot for complaints and suggestions. Imported by
 * AppModule only when FEEDBACK_BOT_TOKEN is set. FeedbackService comes
 * from the @Global() FeedbackModule.
 */
@Module({
  providers: [FeedbackBotService],
})
export class FeedbackBotModule {}

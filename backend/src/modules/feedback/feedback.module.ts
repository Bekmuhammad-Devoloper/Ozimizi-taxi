import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Feedback } from './feedback.entity';
import { FeedbackService } from './feedback.service';
import { FeedbackEvents } from './feedback.events';

@Global()
@Module({
  imports: [TypeOrmModule.forFeature([Feedback])],
  providers: [FeedbackService, FeedbackEvents],
  exports: [FeedbackService, FeedbackEvents],
})
export class FeedbackModule {}

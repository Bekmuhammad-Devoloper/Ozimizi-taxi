import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import {
  CurrentUser,
  JwtPayload,
} from '../../common/decorators/current-user.decorator';
import { ChatService } from './chat.service';

/** Driver side of the order chat; the passenger side lives in the bot. */
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('driver')
@Controller('driver/orders/:id/messages')
export class ChatController {
  constructor(private readonly chat: ChatService) {}

  @Get()
  list(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.chat.listForDriver(user.sub, id);
  }

  @Post()
  send(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() body: { text: string },
  ) {
    return this.chat.sendFromDriver(user.sub, id, body?.text ?? '');
  }
}

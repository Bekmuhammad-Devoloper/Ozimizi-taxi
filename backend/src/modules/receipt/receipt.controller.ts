import { Controller, Get, Param } from '@nestjs/common';
import { ReceiptService } from './receipt.service';

/** Public receipt lookup — the QR on the PNG points here (via the web page). */
@Controller('public/receipts')
export class ReceiptController {
  constructor(private readonly receipts: ReceiptService) {}

  @Get(':id')
  async get(@Param('id') id: string) {
    const d = await this.receipts.dataFor(id);
    // No phone numbers / ids beyond what the client already saw in the bot.
    return { ...d, orderId: undefined, shortId: d.orderId.slice(0, 8).toUpperCase() };
  }
}

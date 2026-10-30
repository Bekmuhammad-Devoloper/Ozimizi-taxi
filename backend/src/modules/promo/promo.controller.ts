import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { PromoInput, PromoService } from './promo.service';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
@Controller('admin/promo-codes')
export class PromoController {
  constructor(private readonly promo: PromoService) {}

  @Get()
  list() {
    return this.promo.list();
  }

  @Post()
  create(@Body() body: PromoInput) {
    return this.promo.create(body ?? {});
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() body: PromoInput) {
    return this.promo.update(id, body ?? {});
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.promo.remove(id);
  }

  @Get(':id/redemptions')
  redemptions(@Param('id') id: string) {
    return this.promo.redemptionsFor(id);
  }
}

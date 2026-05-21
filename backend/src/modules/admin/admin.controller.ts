import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { DriverService } from '../driver/driver.service';
import { ClientService } from '../client/client.service';
import { OrderService } from '../order/order.service';
import { TariffService } from '../tariff/tariff.service';
import { CreateDriverDto } from '../driver/dto/create-driver.dto';
import { AdjustBalanceDto } from '../driver/dto/adjust-balance.dto';
import { UpdateTariffDto } from '../tariff/dto/update-tariff.dto';
import { OrderStatus } from '../order/order.entity';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
@Controller('admin')
export class AdminController {
  constructor(
    private readonly drivers: DriverService,
    private readonly clients: ClientService,
    private readonly orders: OrderService,
    private readonly tariff: TariffService,
  ) {}

  @Get('stats')
  stats(@Query('period') period: 'day' | 'week' | 'month' = 'day') {
    return this.orders.statsFor(period);
  }

  @Get('orders')
  listOrders(
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('status') status?: string,
    @Query('driverId') driverId?: string,
    @Query('clientId') clientId?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    const statuses = status
      ? (status.split(',') as OrderStatus[])
      : undefined;
    return this.orders.listForAdmin({
      from: from ? new Date(from) : undefined,
      to: to ? new Date(to) : undefined,
      status: statuses,
      driverId,
      clientId,
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
    });
  }

  @Get('drivers')
  listDrivers() {
    return this.drivers.listForAdmin();
  }

  @Get('drivers/:id')
  driverDetail(@Param('id') id: string) {
    return this.drivers.detail(id);
  }

  @Post('drivers')
  createDriver(@Body() dto: CreateDriverDto) {
    return this.drivers.createDriver(dto);
  }

  @Delete('drivers/:id')
  removeDriver(@Param('id') id: string) {
    return this.drivers.softDelete(id);
  }

  @Post('drivers/:id/balance')
  adjustBalance(@Param('id') id: string, @Body() dto: AdjustBalanceDto) {
    return this.drivers.adjustBalance(id, dto.amount, dto.note);
  }

  @Get('clients')
  listClients() {
    return this.clients.listForAdmin();
  }

  @Get('clients/:id/orders')
  clientOrders(@Param('id') id: string) {
    return this.clients.ordersFor(id);
  }

  @Get('tariff')
  getTariff() {
    return this.tariff.getCurrent();
  }

  @Patch('tariff')
  updateTariff(@Body() dto: UpdateTariffDto) {
    return this.tariff.update(dto);
  }
}

import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';
import { randomUUID } from 'crypto';
import { DriverService } from './driver.service';
import { FoodService } from '../food/food.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import {
  CurrentUser,
  JwtPayload,
} from '../../common/decorators/current-user.decorator';
import { UpdateLocationDto } from './dto/update-location.dto';
import { CompleteOrderDto } from '../order/dto/complete-order.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';

const ALLOWED_MIMES = new Set(['image/jpeg', 'image/png', 'image/webp']);

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('driver')
@Controller('driver')
export class DriverController {
  constructor(
    private readonly drivers: DriverService,
    private readonly food: FoodService,
  ) {}

  @Post('contract/accept')
  acceptContract(@CurrentUser() user: JwtPayload) {
    return this.drivers.acceptContract(user.sub);
  }

  @Get('me')
  async me(@CurrentUser() user: JwtPayload) {
    const d = await this.drivers.me(user.sub);
    return { ...d, profileComplete: this.drivers.isProfileComplete(d) };
  }

  @Post('online')
  online(@CurrentUser() user: JwtPayload) {
    return this.drivers.toggleOnline(user.sub);
  }

  @Patch('location')
  location(
    @CurrentUser() user: JwtPayload,
    @Body() dto: UpdateLocationDto,
  ) {
    return this.drivers.updateLocation(user.sub, dto.lat, dto.lng);
  }

  /** Same as PATCH — the Android background service posts here. */
  @Post('location')
  locationPost(
    @CurrentUser() user: JwtPayload,
    @Body() dto: UpdateLocationDto,
  ) {
    return this.drivers.updateLocation(user.sub, dto.lat, dto.lng);
  }

  @Patch('profile')
  updateProfile(
    @CurrentUser() user: JwtPayload,
    @Body() dto: UpdateProfileDto,
  ) {
    return this.drivers.updateProfile(user.sub, dto);
  }

  @Post('upload')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: './uploads',
        filename: (_req, file, cb) => {
          const ext = extname(file.originalname).toLowerCase() || '.jpg';
          cb(null, `${randomUUID()}${ext}`);
        },
      }),
      limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
      fileFilter: (_req, file, cb) => {
        if (!ALLOWED_MIMES.has(file.mimetype)) {
          return cb(
            new BadRequestException('Faqat JPG, PNG, WEBP'),
            false,
          );
        }
        cb(null, true);
      },
    }),
  )
  upload(@UploadedFile() file: Express.Multer.File) {
    if (!file) throw new BadRequestException('Fayl yuborilmadi');
    return { url: `/uploads/${file.filename}` };
  }

  @Post('orders/:id/accept')
  accept(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.drivers.acceptOrder(user.sub, id);
  }

  /** Taximeter: street pickup (client not in the system) — ride starts now. */
  @Post('street/start')
  streetStart(@CurrentUser() user: JwtPayload, @Body() body: { lat: number; lng: number }) {
    return this.drivers.startStreetRide(user.sub, Number(body?.lat), Number(body?.lng));
  }

  /** App version on start: '1.0.6' (APK), 'web' (browser)… */
  @Post('app-version')
  appVersion(@CurrentUser() user: JwtPayload, @Body() body: { version?: string; platform?: string }) {
    return this.drivers.reportVersion(user.sub, body?.version, body?.platform);
  }

  /** The phone confirms the order alarm started ringing (app or service). */
  @Post('orders/:id/ring')
  async ring(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() body: { via?: string },
  ) {
    // The id may be a taxi order or a food delivery — each side ignores
    // ids it does not know.
    await this.food.markRinging(user.sub, id, body?.via ?? 'app');
    return this.drivers.ringOrder(user.sub, id, body?.via ?? 'app');
  }

  /** The offer ringing for me right now (app opened from the notification). */
  @Get('offers/current')
  async currentOffer(@CurrentUser() user: JwtPayload) {
    return (await this.drivers.currentOffer(user.sub)) ?? (await this.food.currentOffer(user.sub));
  }

  /** Long-poll for the Android background service (app may be closed). */
  @Get('inbox')
  inbox(@CurrentUser() user: JwtPayload, @Query('after') after?: string) {
    const n = after == null || after === '' ? null : Number(after);
    return this.drivers.inbox(user.sub, Number.isFinite(n as number) ? (n as number) : null);
  }

  /** "Rad etish" on a personal offer — pass it to the next nearest driver. */
  @Post('orders/:id/decline')
  async decline(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    await this.food.declineOffer(user.sub, id);
    return this.drivers.declineOrder(user.sub, id);
  }

  @Post('orders/:id/on-the-way')
  onTheWay(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.drivers.onTheWay(user.sub, id);
  }

  @Post('orders/:id/arrived')
  arrived(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.drivers.arrived(user.sub, id);
  }

  @Post('orders/:id/start')
  start(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.drivers.start(user.sub, id);
  }

  @Post('orders/:id/complete')
  complete(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: CompleteOrderDto,
  ) {
    return this.drivers.complete(user.sub, id, dto);
  }

  @Post('orders/:id/cancel')
  cancelOrder(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.drivers.cancel(user.sub, id);
  }

  @Post('orders/:id/wait/start')
  waitStart(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.drivers.setWaiting(user.sub, id, true);
  }

  @Post('orders/:id/wait/stop')
  waitStop(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.drivers.setWaiting(user.sub, id, false);
  }

  /** The taxi order this driver is on now (it may have been accepted outside the web app). */
  @Get('orders/active')
  activeOrder(@CurrentUser() user: JwtPayload) {
    return this.drivers.activeOrder(user.sub);
  }

  @Get('orders/history')
  history(@CurrentUser() user: JwtPayload) {
    return this.drivers.history(user.sub);
  }

  @Get('orders/available')
  availableOrders(@CurrentUser() user: JwtPayload) {
    return this.drivers.available(user.sub);
  }

  @Get('orders/:id')
  async orderDetail(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
  ) {
    const order = await this.drivers.orderDetail(user.sub, id);
    if (!order) throw new BadRequestException('Buyurtma topilmadi');
    return order;
  }

  @Get('balance')
  balance(@CurrentUser() user: JwtPayload) {
    return this.drivers.balanceFor(user.sub);
  }

  @Get('tariff')
  tariff() {
    return this.drivers.getTariff();
  }
}

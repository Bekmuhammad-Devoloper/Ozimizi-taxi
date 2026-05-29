import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';
import { randomUUID } from 'crypto';
import { DriverService } from './driver.service';
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
  constructor(private readonly drivers: DriverService) {}

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
}

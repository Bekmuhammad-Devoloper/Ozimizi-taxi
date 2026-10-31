import {
  BadRequestException,
  Body,
  Controller,
  Delete,
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
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser, JwtPayload } from '../../common/decorators/current-user.decorator';
import { CreateFoodOrderInput, FoodService, KitchenInput, KitchenOrderInput, MenuItemInput } from './food.service';

/** Photo upload for menu items / kitchen logos (stored under /uploads/food). */
const photoUpload = FileInterceptor('file', {
  storage: diskStorage({
    destination: './uploads/food',
    filename: (_req, file, cb) => cb(null, `${randomUUID()}${extname(file.originalname).toLowerCase() || '.jpg'}`),
  }),
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)) {
      return cb(new BadRequestException('Faqat JPG, PNG, WEBP'), false);
    }
    cb(null, true);
  },
});

const num = (v?: string) => (v == null || v === '' ? undefined : Number(v));

// ---------------------------------------------------------------- admin

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
@Controller('admin/food')
export class FoodAdminController {
  constructor(private readonly food: FoodService) {}

  @Get('summary')
  summary() {
    return this.food.adminSummary();
  }

  @Get('kitchens')
  kitchens() {
    return this.food.listKitchens();
  }

  @Post('kitchens')
  createKitchen(@Body() body: KitchenInput) {
    return this.food.createKitchen(body ?? {});
  }

  @Patch('kitchens/:id')
  updateKitchen(@Param('id') id: string, @Body() body: KitchenInput) {
    return this.food.updateKitchen(id, body ?? {});
  }

  @Get('kitchens/:id/menu')
  menu(@Param('id') id: string) {
    return this.food.getMenu(id);
  }

  /** Kitchen wallet: balance + movements. */
  @Get('kitchens/:id/wallet')
  wallet(@Param('id') id: string) {
    return this.food.kitchenWallet(id);
  }

  /** Top up (positive) or take back (negative) — closed loop with the treasury. */
  @Post('kitchens/:id/balance')
  topUp(@Param('id') id: string, @Body() body: { amount: number; note?: string }) {
    return this.food.topUpKitchen(id, Number(body?.amount), body?.note);
  }

  @Get('kitchens/:id/couriers')
  couriers(@Param('id') id: string) {
    return this.food.listKitchenCouriers(id);
  }

  @Post('kitchens/:id/couriers')
  addCourier(@Param('id') id: string, @Body() body: { phone: string }) {
    return this.food.addKitchenCourier(id, body?.phone ?? '');
  }

  @Delete('kitchens/:id/couriers/:driverId')
  removeCourier(@Param('id') id: string, @Param('driverId') driverId: string) {
    return this.food.removeKitchenCourier(id, driverId);
  }

  @Post('kitchens/:id/categories')
  upsertCategory(@Param('id') id: string, @Body() body: { id?: string; name?: string; sort?: number }) {
    return this.food.upsertCategory(id, body ?? {});
  }

  @Delete('kitchens/:id/categories/:cid')
  deleteCategory(@Param('id') id: string, @Param('cid') cid: string) {
    return this.food.deleteCategory(id, cid);
  }

  @Post('kitchens/:id/items')
  upsertItem(@Param('id') id: string, @Body() body: MenuItemInput) {
    return this.food.upsertItem(id, body ?? {});
  }

  @Delete('kitchens/:id/items/:iid')
  deleteItem(@Param('id') id: string, @Param('iid') iid: string) {
    return this.food.deleteItem(id, iid);
  }

  @Post('upload')
  @UseInterceptors(photoUpload)
  upload(@UploadedFile() file: Express.Multer.File) {
    if (!file) throw new BadRequestException('Fayl yuborilmadi');
    return { url: `/uploads/food/${file.filename}` };
  }

  @Get('orders')
  orders(
    @Query('status') status?: string,
    @Query('kitchenId') kitchenId?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.food.adminOrders({ status, kitchenId, page: num(page), pageSize: num(pageSize) });
  }

  @Get('orders/:id/events')
  events(@Param('id') id: string) {
    return this.food.eventsFor(id);
  }

  @Post('orders/:id/cancel')
  cancel(@Param('id') id: string) {
    return this.food.adminCancel(id);
  }
}

// --------------------------------------------------------------- kitchen

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('kitchen')
@Controller('kitchen')
export class KitchenController {
  constructor(private readonly food: FoodService) {}

  @Get('me')
  me(@CurrentUser() u: JwtPayload) {
    return this.food.kitchenSelf(u.sub);
  }

  @Patch('me')
  updateMe(@CurrentUser() u: JwtPayload, @Body() body: KitchenInput) {
    return this.food.updateKitchenSelf(u.sub, body ?? {});
  }

  @Get('stats')
  stats(@CurrentUser() u: JwtPayload) {
    return this.food.kitchenStats(u.sub);
  }

  @Get('menu')
  menu(@CurrentUser() u: JwtPayload) {
    return this.food.getMenu(u.sub);
  }

  @Post('categories')
  upsertCategory(@CurrentUser() u: JwtPayload, @Body() body: { id?: string; name?: string; sort?: number }) {
    return this.food.upsertCategory(u.sub, body ?? {});
  }

  @Delete('categories/:id')
  deleteCategory(@CurrentUser() u: JwtPayload, @Param('id') id: string) {
    return this.food.deleteCategory(u.sub, id);
  }

  @Post('items')
  upsertItem(@CurrentUser() u: JwtPayload, @Body() body: MenuItemInput) {
    return this.food.upsertItem(u.sub, body ?? {});
  }

  @Delete('items/:id')
  deleteItem(@CurrentUser() u: JwtPayload, @Param('id') id: string) {
    return this.food.deleteItem(u.sub, id);
  }

  @Post('upload')
  @UseInterceptors(photoUpload)
  upload(@UploadedFile() file: Express.Multer.File) {
    if (!file) throw new BadRequestException('Fayl yuborilmadi');
    return { url: `/uploads/food/${file.filename}` };
  }

  @Get('orders')
  orders(@CurrentUser() u: JwtPayload, @Query('scope') scope?: string) {
    return this.food.kitchenOrders(u.sub, scope === 'history' ? 'history' : 'active');
  }

  /** Order typed in by the kitchen (phone / walk-in client, raw or semi-finished goods). */
  @Post('orders')
  createOrder(@CurrentUser() u: JwtPayload, @Body() body: KitchenOrderInput) {
    return this.food.createKitchenOrder(u.sub, body ?? {});
  }

  @Post('orders/:id/accept')
  accept(
    @CurrentUser() u: JwtPayload,
    @Param('id') id: string,
    @Body() body: { prepMinutes?: number; needsCourier?: boolean },
  ) {
    return this.food.kitchenAccept(u.sub, id, body?.prepMinutes, body?.needsCourier);
  }

  @Post('orders/:id/call-courier')
  callCourier(@CurrentUser() u: JwtPayload, @Param('id') id: string) {
    return this.food.kitchenCallCourier(u.sub, id);
  }

  /** Own delivery left the kitchen. */
  @Post('orders/:id/dispatched')
  dispatched(@CurrentUser() u: JwtPayload, @Param('id') id: string) {
    return this.food.kitchenDispatched(u.sub, id);
  }

  /** Own delivery arrived / the client picked it up. */
  @Post('orders/:id/delivered')
  delivered(@CurrentUser() u: JwtPayload, @Param('id') id: string) {
    return this.food.kitchenDelivered(u.sub, id);
  }

  @Get('wallet')
  wallet(@CurrentUser() u: JwtPayload) {
    return this.food.kitchenWallet(u.sub);
  }

  @Get('couriers')
  couriers(@CurrentUser() u: JwtPayload) {
    return this.food.listKitchenCouriers(u.sub);
  }

  @Post('couriers')
  addCourier(@CurrentUser() u: JwtPayload, @Body() body: { phone: string }) {
    return this.food.addKitchenCourier(u.sub, body?.phone ?? '');
  }

  @Delete('couriers/:driverId')
  removeCourier(@CurrentUser() u: JwtPayload, @Param('driverId') driverId: string) {
    return this.food.removeKitchenCourier(u.sub, driverId);
  }

  @Post('orders/:id/reject')
  reject(@CurrentUser() u: JwtPayload, @Param('id') id: string, @Body() body: { reason?: string }) {
    return this.food.kitchenReject(u.sub, id, body?.reason);
  }

  @Post('orders/:id/ready')
  ready(@CurrentUser() u: JwtPayload, @Param('id') id: string) {
    return this.food.kitchenReady(u.sub, id);
  }
}

// ---------------------------------------------------------------- client

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('client')
@Controller('client/food')
export class ClientFoodController {
  constructor(private readonly food: FoodService) {}

  @Get('kitchens')
  kitchens(@Query('lat') lat?: string, @Query('lng') lng?: string) {
    return this.food.kitchensForClient(num(lat), num(lng));
  }

  @Get('kitchens/:id')
  kitchen(@Param('id') id: string, @Query('lat') lat?: string, @Query('lng') lng?: string) {
    return this.food.kitchenForClient(id, num(lat), num(lng));
  }

  /** One delivery fee for several kitchens to one point (checkout with a multi-kitchen cart). */
  @Get('group-quote')
  groupQuote(@Query('kitchenIds') kitchenIds?: string, @Query('lat') lat?: string, @Query('lng') lng?: string) {
    const la = num(lat);
    const ln = num(lng);
    if (!Number.isFinite(la) || !Number.isFinite(ln)) throw new BadRequestException('lat/lng kerak');
    return this.food.groupQuoteForClient(String(kitchenIds ?? '').split(','), la!, ln!);
  }

  /** How much of an order of this size may be paid from bonus. */
  @Get('bonus-max')
  bonusMax(@CurrentUser() u: JwtPayload, @Query('total') total?: string) {
    return this.food.bonusAllowance(u.sub, Math.max(0, Number(total) || 0));
  }

  @Post('orders')
  create(@CurrentUser() u: JwtPayload, @Body() body: CreateFoodOrderInput) {
    return this.food.createOrder(u.sub, body);
  }

  @Get('orders')
  list(@CurrentUser() u: JwtPayload) {
    return this.food.clientOrders(u.sub);
  }

  @Get('orders/:id')
  one(@CurrentUser() u: JwtPayload, @Param('id') id: string) {
    return this.food.clientOrder(u.sub, id);
  }

  @Post('orders/:id/cancel')
  cancel(@CurrentUser() u: JwtPayload, @Param('id') id: string) {
    return this.food.cancelByClient(u.sub, id);
  }
}

// --------------------------------------------------- courier (driver app)

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('driver')
@Controller('driver/deliveries')
export class DeliveryDriverController {
  constructor(private readonly food: FoodService) {}

  @Get('available')
  available(@CurrentUser() u: JwtPayload) {
    return this.food.availableForDriver(u.sub);
  }

  @Get('active')
  active(@CurrentUser() u: JwtPayload) {
    return this.food.courierActive(u.sub);
  }

  @Get('history')
  history(@CurrentUser() u: JwtPayload) {
    return this.food.courierHistory(u.sub);
  }

  @Post(':id/accept')
  accept(@CurrentUser() u: JwtPayload, @Param('id') id: string) {
    return this.food.courierAccept(u.sub, id);
  }

  @Post(':id/decline')
  decline(@CurrentUser() u: JwtPayload, @Param('id') id: string) {
    return this.food.declineOffer(u.sub, id);
  }

  @Post(':id/ring')
  ring(@CurrentUser() u: JwtPayload, @Param('id') id: string, @Body() body: { via?: string }) {
    return this.food.markRinging(u.sub, id, body?.via ?? 'app');
  }

  @Post(':id/picked-up')
  pickedUp(@CurrentUser() u: JwtPayload, @Param('id') id: string) {
    return this.food.courierPickedUp(u.sub, id);
  }

  @Post(':id/delivered')
  delivered(@CurrentUser() u: JwtPayload, @Param('id') id: string) {
    return this.food.courierDelivered(u.sub, id);
  }

  @Post(':id/release')
  release(@CurrentUser() u: JwtPayload, @Param('id') id: string) {
    return this.food.courierRelease(u.sub, id);
  }
}

import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { AuthService } from './auth.service';
import { DriverLoginDto } from './dto/driver-login.dto';
import { DriverRegisterDto } from './dto/driver-register.dto';
import { AdminLoginDto } from './dto/admin-login.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('driver/register')
  driverRegister(@Body() dto: DriverRegisterDto) {
    return this.auth.driverRegister(dto);
  }

  @Post('driver/login')
  driverLogin(@Body() dto: DriverLoginDto) {
    return this.auth.driverLogin(dto);
  }

  @Post('admin/login')
  adminLogin(@Body() dto: AdminLoginDto) {
    return this.auth.adminLogin(dto);
  }

  @HttpCode(200)
  @Post('driver/forgot')
  driverForgot(@Body() dto: ForgotPasswordDto) {
    return this.auth.forgotDriverPassword(dto.phone);
  }

  @HttpCode(200)
  @Post('driver/reset')
  driverReset(@Body() dto: ResetPasswordDto) {
    return this.auth.resetDriverPassword(dto.phone, dto.code, dto.newPassword);
  }
}

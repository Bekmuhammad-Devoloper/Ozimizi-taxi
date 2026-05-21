import { IsString, Matches } from 'class-validator';

export class ForgotPasswordDto {
  @IsString()
  @Matches(/^\+?\d{9,15}$/, { message: 'Telefon noto‘g‘ri' })
  phone: string;
}

import { IsString, Length, Matches, MinLength } from 'class-validator';

export class ResetPasswordDto {
  @IsString()
  @Matches(/^\+?\d{9,15}$/, { message: 'Telefon noto‘g‘ri' })
  phone: string;

  @IsString()
  @Length(6, 6, { message: 'Kod 6 raqamdan iborat' })
  @Matches(/^\d{6}$/, { message: 'Kod faqat raqamlardan iborat bo‘lsin' })
  code: string;

  @IsString()
  @MinLength(6, { message: 'Yangi parol kamida 6 belgi' })
  newPassword: string;
}

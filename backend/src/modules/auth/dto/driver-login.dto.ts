import { IsString, Matches, MinLength } from 'class-validator';

export class DriverLoginDto {
  @IsString()
  @Matches(/^\+?\d{9,15}$/, { message: 'Telefon noto‘g‘ri' })
  phone: string;

  @IsString()
  @MinLength(6, { message: 'Parol kamida 6 belgi bo‘lishi kerak' })
  password: string;
}

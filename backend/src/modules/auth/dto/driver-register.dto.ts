import { IsString, Matches, MinLength } from 'class-validator';

export class DriverRegisterDto {
  @IsString()
  @MinLength(2, { message: 'Ism kamida 2 belgi' })
  fullName: string;

  @IsString()
  @Matches(/^\+?\d{9,15}$/, { message: 'Telefon noto‘g‘ri' })
  phone: string;

  @IsString()
  @MinLength(6, { message: 'Parol kamida 6 belgi bo‘lishi kerak' })
  password: string;
}

import {
  IsEmail,
  IsOptional,
  IsString,
  Matches,
  MinLength,
} from 'class-validator';

export class CreateDriverDto {
  @IsString()
  @MinLength(2)
  fullName: string;

  @IsString()
  @Matches(/^\+?\d{9,15}$/, { message: 'Telefon noto‘g‘ri' })
  phone: string;

  @IsOptional()
  @IsEmail({}, { message: 'Email noto‘g‘ri' })
  email?: string;

  @IsString()
  @MinLength(6, { message: 'Parol kamida 6 belgi' })
  password: string;
}

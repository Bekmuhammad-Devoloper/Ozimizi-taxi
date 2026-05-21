import { IsNumber, IsOptional, IsString } from 'class-validator';

export class AdjustBalanceDto {
  @IsNumber()
  amount: number;

  @IsOptional()
  @IsString()
  note?: string;
}

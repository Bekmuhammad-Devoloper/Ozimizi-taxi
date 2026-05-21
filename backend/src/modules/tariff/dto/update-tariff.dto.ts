import { IsNumber, IsOptional, Min } from 'class-validator';

export class UpdateTariffDto {
  @IsOptional()
  @IsNumber()
  @Min(0)
  pricePerKm?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  minimumFare?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  commissionPerOrder?: number;
}

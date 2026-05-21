import { IsNumber, Min } from 'class-validator';

export class CompleteOrderDto {
  @IsNumber()
  @Min(0)
  distanceKm: number;
}

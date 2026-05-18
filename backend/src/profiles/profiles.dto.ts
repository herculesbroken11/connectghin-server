import { Type } from 'class-transformer';
import {
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class UpdateProfileDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  displayName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  bio?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(18)
  @Max(120)
  age?: number;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  city?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  addressLine1?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  state?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  postalCode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  country?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  locationLat?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  locationLng?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  handicap?: number;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  homeCourse?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  lookingFor?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  drinkingPreference?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  smokingPreference?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  musicPreference?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  gender?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  skillLevel?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  playFrequency?: string;
}

export class AddPhotoDto {
  @IsString()
  @MinLength(4)
  imageUrl!: string;
}

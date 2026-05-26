import { IsEmail, IsIn, IsOptional, IsString } from 'class-validator';

export class BootstrapResellerGoogleUserDto {
	@IsIn(['google'])
	provider!: 'google';

	@IsString()
	providerSubject!: string;

	@IsEmail()
	email!: string;

	@IsOptional()
	@IsString()
	displayName?: string;

	@IsOptional()
	@IsString()
	issuer?: string;

	@IsOptional()
	@IsString()
	hostedDomain?: string;
}

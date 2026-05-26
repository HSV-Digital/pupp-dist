import { forwardRef, Module } from '@nestjs/common';
import { BlobStorageModule } from '../blob-storage/blob-storage.module';
import { EmailModule } from '../email/email.module';
import { ProposalAssetService } from './proposal-asset.service';

@Module({
	imports: [BlobStorageModule, forwardRef(() => EmailModule)],
	providers: [ProposalAssetService],
	exports: [ProposalAssetService],
})
export class ProposalAssetModule {}

import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { AdminModule } from './admin/admin.module';
import { AuthModule } from './auth/auth.module';
import { ConversationsModule } from './conversations/conversations.module';
import { DiscoveryModule } from './discovery/discovery.module';
import { GHINVerificationModule } from './ghin-verification/ghin-verification.module';
import { MailModule } from './mail/mail.module';
import { MatchesModule } from './matches/matches.module';
import { NotificationsModule } from './notifications/notifications.module';
import { PlayerRatingsModule } from './player-ratings/player-ratings.module';
import { PrismaModule } from './prisma/prisma.module';
import { PrivacySafetyModule } from './privacy-safety/privacy-safety.module';
import { ProfilesModule } from './profiles/profiles.module';
import { SettingsModule } from './settings/settings.module';
import { SubscriptionsModule } from './subscriptions/subscriptions.module';
import { SwipesModule } from './swipes/swipes.module';
import { UploadsModule } from './uploads/uploads.module';
import { UsersModule } from './users/users.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    MailModule,
    AuthModule,
    UsersModule,
    ProfilesModule,
    UploadsModule,
    DiscoveryModule,
    SwipesModule,
    MatchesModule,
    ConversationsModule,
    NotificationsModule,
    PlayerRatingsModule,
    GHINVerificationModule,
    SubscriptionsModule,
    PrivacySafetyModule,
    SettingsModule,
    AdminModule,
  ],
})
export class AppModule {}

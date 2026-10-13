import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { LoginService } from '../../application/auth/login.service';
import { PasswordChangeService } from '../../application/auth/password-change.service';
import { RegistrationService } from '../../application/auth/registration.service';
import { SessionService } from '../../application/auth/session.service';
import type { AuthenticatedUserDto } from '../../application/auth';
import {
  ChangePasswordDto,
  LoginDto,
  RefreshTokenDto,
  RegisterCandidateDto,
} from '../dto/dto';
import { AuthPrincipal, CurrentUser, JwtAuthGuard } from '../auth/auth';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly loginService: LoginService,
    private readonly sessionService: SessionService,
    private readonly registrationService: RegistrationService,
    private readonly passwordChangeService: PasswordChangeService,
  ) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  login(@Body() body: LoginDto) {
    return this.loginService.login(body.email, body.password);
  }

  @Post('register/candidate')
  registerCandidate(@Body() body: RegisterCandidateDto) {
    return this.registrationService.registerCandidate(
      body.name,
      body.email,
      body.password,
    );
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  refresh(@Body() body: RefreshTokenDto) {
    return this.sessionService.refresh(body.refreshToken);
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(@Body() body: RefreshTokenDto): Promise<void> {
    await this.sessionService.logout(body.refreshToken);
  }

  @Put('password')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  async changePassword(
    @CurrentUser() user: AuthPrincipal,
    @Body() body: ChangePasswordDto,
  ): Promise<void> {
    await this.passwordChangeService.change(
      user.id,
      body.currentPassword,
      body.newPassword,
    );
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  me(@CurrentUser() user: AuthPrincipal): AuthenticatedUserDto {
    return { ...user };
  }
}

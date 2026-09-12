// Package userapp is the user domain's application layer: wires together
// the register/login/refresh/logout commands and the access-token query
// into a single Service, the one entry point interfaces/http depends on.
package userapp

import (
	"context"

	"palimpsesto/internal/domain/session"
	"palimpsesto/internal/domain/user"

	"palimpsesto/internal/application/user/commands"
	"palimpsesto/internal/application/user/dto"
	"palimpsesto/internal/application/user/queries"
)

// Service is the user application service. Never imports net/http —
// interfaces/http translates HTTP into these method calls and back.
type Service struct {
	register              *usercommands.RegisterHandler
	login                 *usercommands.LoginHandler
	refresh               *usercommands.RefreshHandler
	logout                *usercommands.LogoutHandler
	changePassword        *usercommands.ChangePasswordHandler
	updateDisplayName     *usercommands.UpdateDisplayNameHandler
	setPublicKeys         *usercommands.SetPublicKeysHandler
	setWrappedPrivateKeys *usercommands.SetWrappedPrivateKeysHandler
	revokeDevice          *usercommands.RevokeDeviceHandler
	parseAccessToken      *userqueries.ParseAccessTokenHandler
	lookupUser            *userqueries.LookupUserHandler
	getPublicKeys         *userqueries.GetPublicKeysHandler
	getSalt               *userqueries.GetSaltHandler
	getWrappedPrivateKeys *userqueries.GetWrappedPrivateKeysHandler
	listDevices           *userqueries.ListDevicesHandler
}

func NewService(users user.Repository, sessions session.Repository, keys user.KeyRepository, jwtSecret []byte) *Service {
	return &Service{
		register:              usercommands.NewRegisterHandler(users),
		login:                 usercommands.NewLoginHandler(users, sessions, jwtSecret),
		refresh:               usercommands.NewRefreshHandler(users, sessions, jwtSecret),
		logout:                usercommands.NewLogoutHandler(sessions),
		changePassword:        usercommands.NewChangePasswordHandler(users),
		updateDisplayName:     usercommands.NewUpdateDisplayNameHandler(users),
		setPublicKeys:         usercommands.NewSetPublicKeysHandler(keys),
		setWrappedPrivateKeys: usercommands.NewSetWrappedPrivateKeysHandler(keys),
		revokeDevice:          usercommands.NewRevokeDeviceHandler(sessions),
		parseAccessToken:      userqueries.NewParseAccessTokenHandler(jwtSecret),
		lookupUser:            userqueries.NewLookupUserHandler(users, keys),
		getPublicKeys:         userqueries.NewGetPublicKeysHandler(keys),
		getSalt:               userqueries.NewGetSaltHandler(users),
		getWrappedPrivateKeys: userqueries.NewGetWrappedPrivateKeysHandler(keys),
		listDevices:           userqueries.NewListDevicesHandler(sessions),
	}
}

func (s *Service) Register(ctx context.Context, in usercommands.RegisterInput) error {
	return s.register.Handle(ctx, in)
}

func (s *Service) Login(ctx context.Context, in usercommands.LoginInput) (userdto.TokenPair, error) {
	return s.login.Handle(ctx, in)
}

func (s *Service) Refresh(ctx context.Context, in usercommands.RefreshInput) (userdto.TokenPair, error) {
	return s.refresh.Handle(ctx, in)
}

func (s *Service) Logout(ctx context.Context, presentedToken string) error {
	return s.logout.Handle(ctx, presentedToken)
}

// ParseAccessToken validates an access token and returns the ID of the user
// and the session family it was issued for. Used by the HTTP auth
// middleware.
func (s *Service) ParseAccessToken(token string) (user.ID, session.FamilyID, error) {
	return s.parseAccessToken.Handle(token)
}

func (s *Service) ChangePassword(ctx context.Context, in usercommands.ChangePasswordInput) error {
	return s.changePassword.Handle(ctx, in)
}

// UpdateDisplayName changes the caller's own display name.
func (s *Service) UpdateDisplayName(ctx context.Context, callerID user.ID, displayName user.DisplayName) error {
	return s.updateDisplayName.Handle(ctx, callerID, displayName)
}

func (s *Service) SetPublicKeys(ctx context.Context, callerID user.ID, keys user.PublicKeys) error {
	return s.setPublicKeys.Handle(ctx, callerID, keys)
}

func (s *Service) LookupUser(ctx context.Context, email user.Email) (userdto.PublicKeysView, error) {
	return s.lookupUser.Handle(ctx, email)
}

func (s *Service) GetPublicKeys(ctx context.Context, userID user.ID) (userdto.PublicKeysView, error) {
	return s.getPublicKeys.Handle(ctx, userID)
}

// GetSalt returns the account's salt_mk by email — deliberately callable
// before authentication (see GetSaltHandler's doc comment).
func (s *Service) GetSalt(ctx context.Context, email user.Email) ([]byte, error) {
	return s.getSalt.Handle(ctx, email)
}

func (s *Service) SetWrappedPrivateKeys(ctx context.Context, callerID user.ID, keys user.WrappedPrivateKeys) error {
	return s.setWrappedPrivateKeys.Handle(ctx, callerID, keys)
}

func (s *Service) GetWrappedPrivateKeys(ctx context.Context, callerID user.ID) (user.WrappedPrivateKeys, error) {
	return s.getWrappedPrivateKeys.Handle(ctx, callerID)
}

// ListDevices lists every device currently logged into callerID's account.
// callerFamilyID marks which of those devices is the one making this very
// request, via DeviceView.IsCurrent.
func (s *Service) ListDevices(ctx context.Context, callerID user.ID, callerFamilyID session.FamilyID) ([]userdto.DeviceView, error) {
	return s.listDevices.Handle(ctx, callerID, callerFamilyID)
}

// RevokeDevice logs out a specific device, identified by its session
// family ID (from ListDevices) — never callable across accounts.
func (s *Service) RevokeDevice(ctx context.Context, callerID user.ID, familyID session.FamilyID) error {
	return s.revokeDevice.Handle(ctx, callerID, familyID)
}

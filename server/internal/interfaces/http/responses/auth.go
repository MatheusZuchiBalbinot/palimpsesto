package responses

import (
	"palimpsesto/internal/application/user/dto"
)

// LoginResponse is what a successful login or refresh returns to the
// client.
type LoginResponse struct {
	AccessToken string      `json:"access_token"`
	User        UserSummary `json:"user"`
}

// UserSummary is the account's non-secret info that a client needs
// after authenticating.
type UserSummary struct {
	UserID      string `json:"user_id"`
	Email       string `json:"email"`
	DisplayName string `json:"display_name"`
}

func FromTokenPair(tokens userdto.TokenPair) LoginResponse {
	return LoginResponse{
		AccessToken: tokens.AccessToken,
		User: UserSummary{
			UserID:      string(tokens.Account.ID),
			Email:       string(tokens.Account.Email),
			DisplayName: string(tokens.Account.DisplayName),
		},
	}
}

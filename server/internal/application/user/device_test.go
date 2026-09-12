package userapp_test

import (
	"context"
	"errors"
	"testing"

	"palimpsesto/internal/domain/session"

	"palimpsesto/internal/application/user/commands"
)

// TestDeviceManagement is the acceptance test: a user can see every
// device currently logged into their account and log out any one of
// them individually, without affecting the others or being able to
// touch someone else's session.
func TestDeviceManagement(t *testing.T) {
	svc := newTestService(t)
	ctx := context.Background()
	email := uniqueEmail(t)

	registerInput := usercommands.RegisterInput{Email: email, LoginKey: "correct-horse-battery", SaltMK: testSaltMK}
	if err := svc.Register(ctx, registerInput); err != nil {
		t.Fatalf("register: %v", err)
	}

	laptop, err := svc.Login(ctx, usercommands.LoginInput{Email: email, LoginKey: "correct-horse-battery", DeviceLabel: "laptop-chrome"})
	if err != nil {
		t.Fatalf("login from laptop: %v", err)
	}
	phone, err := svc.Login(ctx, usercommands.LoginInput{Email: email, LoginKey: "correct-horse-battery", DeviceLabel: "phone-safari"})
	if err != nil {
		t.Fatalf("login from phone: %v", err)
	}

	t.Run("both devices show up in the list", func(t *testing.T) {
		devices, err := svc.ListDevices(ctx, laptop.Account.ID, "")
		if err != nil {
			t.Fatalf("listing devices: %v", err)
		}
		if len(devices) != 2 {
			t.Fatalf("want 2 devices, got %d", len(devices))
		}
		labels := map[string]bool{}
		for _, d := range devices {
			labels[d.DeviceLabel] = true
		}
		if !labels["laptop-chrome"] || !labels["phone-safari"] {
			t.Fatalf("want both device labels present, got %+v", devices)
		}
	})

	t.Run("the device matching the caller's own access token is marked current", func(t *testing.T) {
		_, laptopFamilyID, err := svc.ParseAccessToken(laptop.AccessToken)
		if err != nil {
			t.Fatalf("parsing laptop access token: %v", err)
		}

		devices, err := svc.ListDevices(ctx, laptop.Account.ID, laptopFamilyID)
		if err != nil {
			t.Fatalf("listing devices: %v", err)
		}
		for _, d := range devices {
			isLaptop := d.DeviceLabel == "laptop-chrome"
			if d.IsCurrent != isLaptop {
				t.Fatalf("device %+v: want IsCurrent=%v, got %v", d, isLaptop, d.IsCurrent)
			}
		}
	})

	t.Run("a stranger cannot revoke someone else's device", func(t *testing.T) {
		strangerEmail := uniqueEmail(t)
		if err := svc.Register(ctx, usercommands.RegisterInput{Email: strangerEmail, LoginKey: "correct-horse-battery", SaltMK: testSaltMK}); err != nil {
			t.Fatalf("registering stranger: %v", err)
		}
		stranger, err := svc.Login(ctx, usercommands.LoginInput{Email: strangerEmail, LoginKey: "correct-horse-battery", DeviceLabel: "stranger-device"})
		if err != nil {
			t.Fatalf("logging in stranger: %v", err)
		}

		devices, err := svc.ListDevices(ctx, laptop.Account.ID, "")
		if err != nil {
			t.Fatalf("listing devices: %v", err)
		}
		phoneFamilyID := session.FamilyID(devices[0].FamilyID)
		for _, d := range devices {
			if d.DeviceLabel == "phone-safari" {
				phoneFamilyID = session.FamilyID(d.FamilyID)
			}
		}

		err = svc.RevokeDevice(ctx, stranger.Account.ID, phoneFamilyID)
		if !errors.Is(err, session.ErrNotFound) {
			t.Fatalf("want %v, got %v", session.ErrNotFound, err)
		}
	})

	t.Run("revoking the phone logs it out but leaves the laptop alone", func(t *testing.T) {
		devices, err := svc.ListDevices(ctx, laptop.Account.ID, "")
		if err != nil {
			t.Fatalf("listing devices: %v", err)
		}
		var phoneFamilyID session.FamilyID
		for _, d := range devices {
			if d.DeviceLabel == "phone-safari" {
				phoneFamilyID = session.FamilyID(d.FamilyID)
			}
		}
		if phoneFamilyID == "" {
			t.Fatal("phone device not found in list")
		}

		if err := svc.RevokeDevice(ctx, laptop.Account.ID, phoneFamilyID); err != nil {
			t.Fatalf("revoking phone: %v", err)
		}

		remaining, err := svc.ListDevices(ctx, laptop.Account.ID, "")
		if err != nil {
			t.Fatalf("listing devices after revoke: %v", err)
		}
		if len(remaining) != 1 || remaining[0].DeviceLabel != "laptop-chrome" {
			t.Fatalf("want only laptop-chrome remaining, got %+v", remaining)
		}

		_, err = svc.Refresh(ctx, usercommands.RefreshInput{PresentedToken: phone.RefreshToken, DeviceLabel: "phone-safari"})
		if !errors.Is(err, session.ErrInvalidRefreshToken) {
			t.Fatalf("revoked phone session should no longer refresh: want %v, got %v", session.ErrInvalidRefreshToken, err)
		}

		if _, err := svc.Refresh(ctx, usercommands.RefreshInput{PresentedToken: laptop.RefreshToken, DeviceLabel: "laptop-chrome"}); err != nil {
			t.Fatalf("laptop session should still refresh fine: %v", err)
		}
	})
}

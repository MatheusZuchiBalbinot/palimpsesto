package documentapp_test

import (
	"context"
	"errors"
	"testing"

	"palimpsesto/internal/domain/document"

	"palimpsesto/internal/application/document/commands"
)

// TestFolders is the acceptance test: a user can create, list, and
// delete their own folders, file a document under one, and only the
// document's owner can do the filing.
func TestFolders(t *testing.T) {
	env := newTestEnv(t)
	ctx := context.Background()

	owner := newTestUser(t, env)
	member := newTestUser(t, env)

	doc, err := env.documents.Create(ctx, owner.ID, "filed doc")
	if err != nil {
		t.Fatalf("create: %v", err)
	}
	addMemberInput := documentcommands.AddMemberInput{DocumentID: doc.ID, Caller: owner.ID, Email: member.Email, Role: document.RoleEditor}
	if err := env.documents.AddMemberByEmail(ctx, addMemberInput); err != nil {
		t.Fatalf("adding member: %v", err)
	}

	t.Run("an empty name is rejected", func(t *testing.T) {
		in := documentcommands.CreateFolderInput{OwnerID: owner.ID, Name: "   ", Color: "#8C6A3F"}
		if _, err := env.documents.CreateFolder(ctx, in); !errors.Is(err, document.ErrInvalidFolderName) {
			t.Fatalf("want %v, got %v", document.ErrInvalidFolderName, err)
		}
	})

	folderInput := documentcommands.CreateFolderInput{OwnerID: owner.ID, Name: "Investigação porto", Color: "#5D7C71"}
	folder, err := env.documents.CreateFolder(ctx, folderInput)
	if err != nil {
		t.Fatalf("creating folder: %v", err)
	}
	if folder.Name != "Investigação porto" {
		t.Fatalf("want name %q, got %q", "Investigação porto", folder.Name)
	}

	t.Run("the folder shows up in the owner's list", func(t *testing.T) {
		folders, err := env.documents.ListFolders(ctx, owner.ID)
		if err != nil {
			t.Fatalf("listing: %v", err)
		}
		if len(folders) != 1 || folders[0].ID != folder.ID {
			t.Fatalf("want [%v], got %+v", folder.ID, folders)
		}
	})

	t.Run("the owner renames and recolors the folder", func(t *testing.T) {
		in := documentcommands.UpdateFolderInput{ID: folder.ID, OwnerID: owner.ID, Name: "Investigação porto (atualizado)", Color: "#4A4740"}
		updated, err := env.documents.UpdateFolder(ctx, in)
		if err != nil {
			t.Fatalf("updating folder: %v", err)
		}
		if updated.Name != "Investigação porto (atualizado)" || updated.Color != "#4A4740" {
			t.Fatalf("want updated name/color, got %+v", updated)
		}
	})

	t.Run("updating a folder that isn't the caller's own fails", func(t *testing.T) {
		in := documentcommands.UpdateFolderInput{ID: folder.ID, OwnerID: member.ID, Name: "hijacked", Color: "#8C6A3F"}
		if _, err := env.documents.UpdateFolder(ctx, in); !errors.Is(err, document.ErrFolderNotFound) {
			t.Fatalf("want %v, got %v", document.ErrFolderNotFound, err)
		}
	})

	t.Run("an empty name is rejected on update too", func(t *testing.T) {
		in := documentcommands.UpdateFolderInput{ID: folder.ID, OwnerID: owner.ID, Name: "   ", Color: "#8C6A3F"}
		if _, err := env.documents.UpdateFolder(ctx, in); !errors.Is(err, document.ErrInvalidFolderName) {
			t.Fatalf("want %v, got %v", document.ErrInvalidFolderName, err)
		}
	})

	t.Run("a non-owner member cannot file the document", func(t *testing.T) {
		fid := folder.ID
		in := documentcommands.SetDocumentFolderInput{DocumentID: doc.ID, Caller: member.ID, FolderID: &fid}
		if err := env.documents.SetDocumentFolder(ctx, in); !errors.Is(err, document.ErrNotOwner) {
			t.Fatalf("want %v, got %v", document.ErrNotOwner, err)
		}
	})

	t.Run("the owner files the document, and it shows up on Get", func(t *testing.T) {
		fid := folder.ID
		in := documentcommands.SetDocumentFolderInput{DocumentID: doc.ID, Caller: owner.ID, FolderID: &fid}
		if err := env.documents.SetDocumentFolder(ctx, in); err != nil {
			t.Fatalf("filing: %v", err)
		}
		got, err := env.documents.Get(ctx, doc.ID, owner.ID)
		if err != nil {
			t.Fatalf("get: %v", err)
		}
		if got.FolderID == nil || *got.FolderID != folder.ID {
			t.Fatalf("want folder %v, got %+v", folder.ID, got.FolderID)
		}
	})

	t.Run("deleting the folder un-files the document instead of deleting it", func(t *testing.T) {
		if err := env.documents.DeleteFolder(ctx, folder.ID, owner.ID); err != nil {
			t.Fatalf("deleting folder: %v", err)
		}
		got, err := env.documents.Get(ctx, doc.ID, owner.ID)
		if err != nil {
			t.Fatalf("get after folder deletion: %v", err)
		}
		if got.FolderID != nil {
			t.Fatalf("want folder cleared, got %v", *got.FolderID)
		}
	})

	t.Run("deleting a folder that isn't the caller's own fails", func(t *testing.T) {
		otherInput := documentcommands.CreateFolderInput{OwnerID: member.ID, Name: "Member's own folder", Color: "#8C6A3F"}
		otherFolder, err := env.documents.CreateFolder(ctx, otherInput)
		if err != nil {
			t.Fatalf("creating member's folder: %v", err)
		}
		if err := env.documents.DeleteFolder(ctx, otherFolder.ID, owner.ID); !errors.Is(err, document.ErrFolderNotFound) {
			t.Fatalf("want %v, got %v", document.ErrFolderNotFound, err)
		}
	})
}

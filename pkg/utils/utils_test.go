package utils

import (
	"testing"

	"k8s.io/apimachinery/pkg/util/validation"
)

func TestGetImageRegistryAndRepo(t *testing.T) {
	testcase := []struct {
		image    string
		registry string
		repo     string
	}{
		{"nginx", "", "library/nginx"},
		{"nginx:latest", "", "library/nginx"},
		{"zzde/kite:latest", "", "zzde/kite"},
		{"docker.io/library/nginx", "docker.io", "library/nginx"},
		{"docker.io/library/nginx:latest", "docker.io", "library/nginx"},
		{"gcr.io/my-project/my-image", "gcr.io", "my-project/my-image"},
		{"gcr.io/my-project/my-image:tag", "gcr.io", "my-project/my-image"},
		{"quay.io/my-org/my-repo", "quay.io", "my-org/my-repo"},
		{"quay.io/my-org/my-repo:tag", "quay.io", "my-org/my-repo"},
		{"registry.example.com/my-repo/test", "registry.example.com", "my-repo/test"},
	}
	for _, tc := range testcase {
		registry, repo := GetImageRegistryAndRepo(tc.image)
		if registry != tc.registry || repo != tc.repo {
			t.Errorf("GetImageRegistryAndRepo(%q) = (%q, %q), want (%q, %q)", tc.image, registry, repo, tc.registry, tc.repo)
		}
	}
}

func TestGenerateNodeAgentName(t *testing.T) {
	testcase := []struct {
		nodeName string
	}{
		{"node1"},
		{"shortname"},
		{"a-very-long-node-name-that-exceeds-the-maximum-length-allowed-for-kubernetes-names"},
		{"node-with-63-characters-abcdefghijklmnopqrstuvwxyz-123456789101"},
		{"ip-10-0-10-10.ch-west-2.compute.internal"},
		{"ip-10-0-10-10.ch-west-2.compute-internal"},
	}

	for _, tc := range testcase {
		podName := GenerateNodeAgentName(tc.nodeName)
		if errs := validation.IsDNS1123Subdomain(podName); len(errs) > 0 {
			t.Errorf("GenerateNodeAgentName(%q) = %q, invalid DNS subdomain: %v", tc.nodeName, podName, errs)
		}
	}
}

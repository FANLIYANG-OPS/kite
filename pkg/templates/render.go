package templates

import (
	"bytes"
	"encoding/base64"
	"embed"
	"strings"
	"text/template"
)

//go:embed redis
//go:embed rocketmq
//go:embed hortonworks
//go:embed elascticoperator
//go:embed elasticsearch
//go:embed dolphinscheduler
var fs embed.FS

func indent(n int, s string) string {
	pad := strings.Repeat(" ", n)
	var out []string
	for _, line := range strings.Split(strings.TrimSuffix(s, "\n"), "\n") {
		out = append(out, pad+line)
	}
	return strings.Join(out, "\n")
}

var funcMap = template.FuncMap{
	"indent": func(s string, n int) string { return indent(n, s) },
}

// RedisParams holds parameters for Redis Sentinel template
type RedisParams struct {
	Name            string
	Namespace       string
	Password        string
	HeadlessSvc     string
	RedisSvc        string
	SentinelMonitor string
	PasswordB64     string
}

// RocketMQParams holds parameters for RocketMQ template
type RocketMQParams struct {
	Name    string
	NsAddr  string // nameserver address for broker init
}

// HortonworksParams holds parameters for Hortonworks Schema Registry template
type HortonworksParams struct {
	Name      string
	Namespace string
}

// ElasticOperatorParams holds parameters for Elastic Operator template
type ElasticOperatorParams struct {
	Name      string
	Namespace string
}

// ElasticsearchParams holds parameters for Elasticsearch template
type ElasticsearchParams struct {
	Name      string
	Namespace string
}

// DolphinSchedulerParams holds parameters for DolphinScheduler template
type DolphinSchedulerParams struct {
	Name      string
	Namespace string
}

// RenderRedis generates Redis Sentinel YAML resources
func RenderRedis(name, namespace, password string) ([]string, error) {
	headlessSvc := name + "-headless." + namespace + ".svc.cluster.local"
	redisSvc := name + "." + namespace + ".svc.cluster.local"
	sentinelMonitor := name + "-0." + headlessSvc
	passwordB64 := base64.StdEncoding.EncodeToString([]byte(password))

	params := RedisParams{
		Name:            name,
		Namespace:       namespace,
		Password:        password,
		HeadlessSvc:     headlessSvc,
		RedisSvc:        redisSvc,
		SentinelMonitor: sentinelMonitor,
		PasswordB64:     passwordB64,
	}

	files := []string{
		"redis/redis-services.yaml",
		"redis/redis-headless.yaml",
		"redis/redis-configuration.yaml",
		"redis/redis-health.yaml",
		"redis/redis-scripts.yaml",
		"redis/secrets.yaml",
		"redis/redis.yaml",
	}

	return renderTemplates(fs, files, params, funcMap)
}

// RenderRocketMQ generates RocketMQ YAML resources
func RenderRocketMQ(name, namespace string) ([]string, error) {
	nsAddr := name + "-0." + name + "-headless." + namespace + ".svc.cluster.local:9876;" +
		name + "-1." + name + "-headless." + namespace + ".svc.cluster.local:9876"

	data := map[string]string{
		"Name":    name,
		"NsAddr":  nsAddr,
		"Namespace": namespace,
	}

	files := []string{
		"rocketmq/01-broker-config.yaml",
		"rocketmq/03-rocketmq-headless-service.yaml",
		"rocketmq/04-rocketmq-nameserver.yaml",
		"rocketmq/02-broker.yaml",
		"rocketmq/05-rocketmq-service.yaml",
	}

	return renderRocketMQTemplates(fs, files, data, nil)
}

// RenderHortonworks generates Hortonworks Schema Registry YAML resources
func RenderHortonworks(name, namespace string) ([]string, error) {
	params := HortonworksParams{
		Name:      name,
		Namespace: namespace,
	}
	files := []string{
		"hortonworks/configmaps.yaml",
		"hortonworks/service.yaml",
		"hortonworks/nodeport-service.yaml",
		"hortonworks/hortonworks.yaml",
	}
	return renderTemplates(fs, files, params, funcMap)
}

// RenderElasticsearch generates Elasticsearch + Kibana YAML resources
func RenderElasticsearch(name, namespace string) ([]string, error) {
	params := ElasticsearchParams{
		Name:      name,
		Namespace: namespace,
	}
	// Single multi-doc file; render then split into separate YAML docs
	content, err := fs.ReadFile("elasticsearch/elasticsearch-8.11.0.yaml")
	if err != nil {
		return nil, err
	}
	tmpl, err := template.New("elasticsearch-8.11.0.yaml").Funcs(funcMap).Parse(string(content))
	if err != nil {
		return nil, err
	}
	var buf bytes.Buffer
	if err := tmpl.Execute(&buf, params); err != nil {
		return nil, err
	}
	return splitYAMLDocuments(buf.String()), nil
}

// RenderDolphinScheduler generates DolphinScheduler Deployment + Service YAML resources
func RenderDolphinScheduler(name, namespace string) ([]string, error) {
	params := DolphinSchedulerParams{
		Name:      name,
		Namespace: namespace,
	}
	files := []string{
		"dolphinscheduler/service.yaml",
		"dolphinscheduler/dolphinscheduler.yaml",
	}
	return renderTemplates(fs, files, params, funcMap)
}

// splitYAMLDocuments splits multi-document YAML into single-document strings (trimmed, non-empty).
func splitYAMLDocuments(data string) []string {
	var out []string
	for _, doc := range strings.Split(data, "---") {
		s := strings.TrimSpace(doc)
		if s != "" {
			out = append(out, s)
		}
	}
	return out
}

// RenderElasticOperator generates Elastic Operator YAML resources (CRDs + operator).
// Returns one YAML document per element. CRDs are first; if a CRD already exists it should be updated.
func RenderElasticOperator(name, namespace string) ([]string, error) {
	params := ElasticOperatorParams{Name: name, Namespace: namespace}

	// CRD file: no template vars, just split
	crds, err := fs.ReadFile("elascticoperator/es-crd.yaml")
	if err != nil {
		return nil, err
	}
	all := splitYAMLDocuments(string(crds))

	// Operator file: template then split
	opContent, err := fs.ReadFile("elascticoperator/es-operator.yaml")
	if err != nil {
		return nil, err
	}
	tmpl, err := template.New("es-operator.yaml").Funcs(funcMap).Parse(string(opContent))
	if err != nil {
		return nil, err
	}
	var buf bytes.Buffer
	if err := tmpl.Execute(&buf, params); err != nil {
		return nil, err
	}
	all = append(all, splitYAMLDocuments(buf.String())...)
	return all, nil
}

func renderTemplates(fs embed.FS, files []string, data interface{}, funcMap template.FuncMap) ([]string, error) {
	var result []string
	for _, f := range files {
		content, err := fs.ReadFile(f)
		if err != nil {
			return nil, err
		}
		tmpl, err := template.New(f).Funcs(funcMap).Parse(string(content))
		if err != nil {
			return nil, err
		}
		var buf bytes.Buffer
		if err := tmpl.Execute(&buf, data); err != nil {
			return nil, err
		}
		result = append(result, strings.TrimSpace(buf.String()))
	}
	return result, nil
}

func renderRocketMQTemplates(fs embed.FS, files []string, data map[string]string, funcMap template.FuncMap) ([]string, error) {
	var result []string
	fm := funcMap
	if fm == nil {
		fm = template.FuncMap{}
	}
	for _, f := range files {
		content, err := fs.ReadFile(f)
		if err != nil {
			return nil, err
		}
		tmpl, err := template.New(f).Funcs(fm).Parse(string(content))
		if err != nil {
			return nil, err
		}
		var buf bytes.Buffer
		if err := tmpl.Execute(&buf, data); err != nil {
			return nil, err
		}
		result = append(result, strings.TrimSpace(buf.String()))
	}
	return result, nil
}

# Kite - Modern Kubernetes Dashboard

<div align="center">

<img src="./docs/assets/logo.svg" alt="Kite Logo" width="128" height="128">

_A modern, intuitive Kubernetes dashboard_

<a href="https://trendshift.io/repositories/21820" target="_blank"><img src="https://trendshift.io/api/badge/repositories/21820" alt="kite-org%2Fkite | Trendshift" style="width: 250px; height: 55px;" width="250" height="55"/></a>

[![Go Version](https://img.shields.io/badge/Go-1.25+-00ADD8?style=flat&logo=go)](https://golang.org)
[![React](https://img.shields.io/badge/React-19+-61DAFB?style=flat&logo=react)](https://reactjs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5+-3178C6?style=flat&logo=typescript)](https://www.typescriptlang.org)
[![License](https://img.shields.io/badge/License-Apache-green.svg)](LICENSE)
<a href="https://join.slack.com/t/kite-dashboard/shared_invite/zt-3cl9mccs7-eQZ1_t6IoTPHZkxXED1ceg"><img alt="Join Kite" src="https://badgen.net/badge/Slack/Join%20Kite/0abd59?icon=slack" /></a>

[**Live Demo**](https://kite-demo.zzde.me) | [**Documentation**](https://kite.zzde.me)
<br>
**English** | [中文](./README_zh.md)

</div>

Kite is a lightweight, modern Kubernetes dashboard that provides an intuitive interface for managing and monitoring your Kubernetes clusters. It offers real-time metrics, comprehensive resource management, multi-cluster support, and a beautiful user experience.

![Dashboard Overview](docs/screenshots/overview.png)
_Comprehensive cluster overview with real-time metrics and resource statistics_

## ✨ Features

### 🎯 **Modern User Experience**

- 🌓 **Multi-Theme Support** - Dark/light/color themes with system preference detection
- 🔍 **Advanced Search** - Global search across all resources
- 🌐 **Internationalization** - Support for English and Chinese languages
- 📱 **Responsive Design** - Optimized for desktop, tablet, and mobile devices

### 🏘️ **Multi-Cluster Management**

- 🔄 **Seamless Cluster Switching** - Switch between multiple Kubernetes clusters
- 📊 **Per-Cluster Monitoring** - Independent Prometheus configuration for each cluster
- ⚙️ **Kubeconfig Integration** - Automatic discovery of clusters from your kubeconfig file
- 🔐 **Cluster Access Control** - Fine-grained permissions for cluster access management

### 🔍 **Comprehensive Resource Management**

- 📋 **Full Resource Coverage** - Pods, Deployments, Services, ConfigMaps, Secrets, PVs, PVCs, Nodes, and more
- 📄 **Live YAML Editing** - Built-in Monaco editor with syntax highlighting and validation
- 📊 **Detailed Resource Views** - In-depth information with containers, volumes, events, and conditions
- 🔗 **Resource Relationships** - Visualize connections between related resources (e.g., Deployment → Pods)
- ⚙️ **Resource Operations** - Create, update, delete, scale, and restart resources directly from the UI
- 🔄 **Custom Resources** - Full support for CRDs (Custom Resource Definitions)
- 🏷️ **Quick Image Tag Selector** - Easily select and change container image tags based on Docker and container registry APIs
- 🎨 **Customizable Sidebar** - Customize sidebar visibility and order, and add CRDs for quick access
- 🔌 **Kube Proxy** - Access pods or services directly through Kite, no more `kubectl port-forward`

### 📈 **Monitoring & Observability**

- 📊 **Real-time Metrics** - CPU, memory, and network usage charts powered by Prometheus
- 📋 **Cluster Overview** - Comprehensive cluster health and resource statistics
- 📝 **Live Logs** - Stream pod logs in real-time with filtering and search capabilities
- 💻 **Web/Node Terminal** - Execute commands directly in pods/nodes through the browser
- 📈 **Node Monitoring** - Detailed node-level performance metrics and utilization
- 📊 **Pod Monitoring** - Individual pod resource usage and performance tracking

### 🔐 **Security**

- 🛡️ **OAuth Integration** - Supports OAuth management in the UI
- 🔒 **Role-Based Access Control** - Supports user permission management in the UI
- 👥 **User Management** - Comprehensive user management and role allocation in the UI

---

## 🚀 Quick Start

For detailed instructions, please refer to the [documentation](https://kite.zzde.me/guide/installation.html).

### Docker

To run Kite using Docker, you can use the pre-built image:

```bash
docker run -d -p 8080:8080 -v ./data:/data -e DB_DSN=/data/db.sqlite ghcr.io/kite-org/kite:latest
```

### Deploy in Kubernetes

#### Using Helm (Recommended)

1. **Add Helm repository**

   ```bash
   helm repo add kite https://kite-org.github.io/kite/
   helm repo update
   ```

2. **Install with default values**

   ```bash
   helm install kite kite/kite -n kube-system
   ```

#### Using kubectl

1. **Apply deployment manifests**

   ```bash
   kubectl apply -f deploy/install.yaml
   # or install it online
   # Note: This method may not be suitable for a production environment, as it does not include any configuration related to persistence. You will need to manually mount the persistence volume and set the environment variable DB_DSN=/data/db.sqlite to ensure that data is not lost. Alternatively, an external database can be used.
   # ref: https://kite.zzde.me/faq.html#persistence-issues
   kubectl apply -f https://raw.githubusercontent.com/kite-org/kite/refs/heads/main/deploy/install.yaml
   ```

2. **Access via port-forward**

   ```bash
   kubectl port-forward -n kube-system svc/kite 8080:8080
   ```

### Build from Source

#### 📋 Prerequisites

1. **Clone the repository**

   ```bash
   git clone https://github.com/kite-org/kite.git
   cd kite
   ```

2. **Build the project**

   ```bash
   make deps
   make build
   ```

3. **Run the server**

   ```bash
   make run
   ```

---

## 🔍 Troubleshooting

For troubleshooting, please refer to the [documentation](https://kite.zzde.me).

## 💖 Support This Project

If you find Kite helpful, please consider supporting its development! Your donations help maintain and improve this project.

### Donation Methods

<table>
  <tr>
    <td align="center">
      <b>Alipay</b><br>
      <img src="./docs/donate/alipay.jpeg" alt="Alipay QR Code" width="200">
    </td>
    <td align="center">
      <b>WeChat Pay</b><br>
      <img src="./docs/donate/wechat.jpeg" alt="WeChat Pay QR Code" width="200">
    </td>
    <td align="center">
      <b>PayPal</b><br>
      <a href="https://www.paypal.me/zxh326">
        <img src="https://www.paypalobjects.com/webstatic/mktg/logo/pp_cc_mark_111x69.jpg" alt="PayPal" width="150">
      </a>
    </td>
  </tr>
</table>

Thank you for your support! ❤️

## 🤝 Contributing

We welcome contributions! Please see our [contributing guidelines](https://kite.zzde.me/faq.html#how-can-i-contribute-to-kite) for details on how to get involved.

## 📄 License

This project is licensed under the Apache License 2.0 - see the [LICENSE](LICENSE) file for details.

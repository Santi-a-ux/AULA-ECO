# AULA-ECO 🌱♻️

Sistema web de educación ambiental y seguimiento de reciclaje desarrollado para promover prácticas sostenibles en instituciones educativas.

## 📋 Descripción

AULA-ECO es una aplicación web integral que permite a usuarios y administradores registrar, monitorear y analizar actividades de reciclaje. El sistema incluye un mecanismo de puntos que incentiva la participación activa en el reciclaje de diferentes materiales.

### Características Principales

- 🔐 **Sistema de autenticación** con roles (administrador y usuario)
- 📊 **Dashboard de estadísticas** personalizadas por usuario
- 📈 **Gráficos de evolución** del reciclaje a lo largo del tiempo
- ⭐ **Sistema de puntos** basado en materiales reciclados
- 👥 **Panel de administrador** con estadísticas globales
- 📝 **Registro de reciclaje** con diferentes tipos de materiales
- 🏆 **Colección personal** de registros de reciclaje

### Materiales Soportados

El sistema reconoce y otorga puntos por los siguientes materiales:
- **Tetra Pak** - 6 puntos por unidad
- **Aluminio** - 5 puntos por unidad
- **Plástico PP** - 4 puntos por unidad

## 🛠️ Tecnologías Utilizadas

### Frontend
- HTML5
- CSS3 (diseño responsive con variables CSS)
- JavaScript vanilla
- Font Awesome 6.4.0 (iconos)
- Chart.js (gráficos estadísticos)

### Backend
- Node.js
- Express.js
- SQLite3 (base de datos)
- JSON Web Tokens (JWT) para autenticación
- bcrypt/bcryptjs para hash de contraseñas
- CORS habilitado

## 📁 Estructura del Proyecto

```
AULA-ECO/
│
├── backend/
│   ├── server.js              # Servidor Express y API REST
│   ├── package.json           # Dependencias del backend
│   ├── check_db.js            # Script de inspección de BD
│   ├── test_api.js            # Tests de API
│   └── aula_eco_new.db        # Base de datos SQLite
│
├── login.html                 # Página de inicio de sesión
├── prinpal_si_1.html          # Página principal/landing
├── body_principal.html        # Dashboard de estadísticas
├── add_recycling.html         # Formulario de registro de reciclaje
├── admin.html                 # Panel de administrador
├── user_collections.html      # Historial personal de reciclaje
└── README.md                  # Este archivo
```

## 🚀 Instalación

### Prerrequisitos

- Node.js (v14 o superior)
- npm (v6 o superior)

### Pasos de Instalación

1. **Clonar el repositorio**
   ```bash
   git clone https://github.com/Santi-a-ux/AULA-ECO.git
   cd AULA-ECO
   ```

2. **Instalar dependencias del backend**
   ```bash
   cd backend
   npm install
   ```

3. **Iniciar el servidor**
   ```bash
   npm start
   ```
   
   O para desarrollo con recarga automática:
   ```bash
   npm run dev
   ```

4. **Acceder a la aplicación**
   
   Abrir el navegador y visitar:
   ```
   http://localhost:3000/login.html
   ```

## 👤 Usuarios de Prueba

El sistema viene con usuarios pre-configurados para pruebas:

### Administrador
- **Usuario:** Santiago
- **Contraseña:** admin123
- **Permisos:** Acceso completo, visualización de estadísticas globales

### Usuarios Regulares
- **Usuario:** Julian | **Contraseña:** user123
- **Usuario:** Anita | **Contraseña:** user123
- **Usuario:** Mauricio | **Contraseña:** user123
- **Permisos:** Registro de reciclaje, visualización de estadísticas personales

## 🔌 API Endpoints

### Autenticación
- `POST /api/login` - Iniciar sesión
  ```json
  {
    "username": "string",
    "password": "string"
  }
  ```

### Usuario
- `GET /api/me/records` - Obtener registros del usuario autenticado
- `GET /api/stats` - Obtener estadísticas personales
- `GET /api/evolution` - Obtener evolución de reciclaje

### Reciclaje
- `POST /api/recyclings` - Crear nuevo registro de reciclaje
  ```json
  {
    "material": "string",
    "item": "string",
    "quantity": number,
    "center": "string"
  }
  ```

### Administración (requiere rol admin)
- `GET /api/global-stats` - Estadísticas globales del sistema
- `GET /api/admin/recyclings` - Todos los registros de reciclaje

### Público
- `GET /api/public/recyclings` - Registros públicos de reciclaje
- `GET /api/health` - Estado del servidor

## 💻 Desarrollo

### Estructura de la Base de Datos

#### Tabla: users
| Campo    | Tipo    | Descripción                    |
|----------|---------|--------------------------------|
| id       | INTEGER | ID único (autoincremental)     |
| username | TEXT    | Nombre de usuario (único)      |
| password | TEXT    | Contraseña hasheada            |
| role     | TEXT    | Rol (admin/user)               |

#### Tabla: recyclings
| Campo    | Tipo    | Descripción                    |
|----------|---------|--------------------------------|
| id       | INTEGER | ID único (autoincremental)     |
| user_id  | INTEGER | ID del usuario                 |
| material | TEXT    | Tipo de material reciclado     |
| kg       | REAL    | Cantidad en unidades*          |
| points   | INTEGER | Puntos otorgados               |
| date     | TEXT    | Fecha del registro             |
| center   | TEXT    | Centro de reciclaje            |
| item     | TEXT    | Tipo de objeto específico      |

**Nota:** El campo `kg` almacena la cantidad en unidades (no peso), se mantiene este nombre por razones de compatibilidad con versiones anteriores.

### Scripts Disponibles

En el directorio `backend/`:

- `npm start` - Inicia el servidor en modo producción
- `npm run dev` - Inicia el servidor con nodemon (recarga automática)

### Herramientas de Desarrollo

- **check_db.js**: Script para inspeccionar el contenido de la base de datos
  ```bash
  node backend/check_db.js
  ```

- **test_api.js**: Script para probar los endpoints de la API
  ```bash
  node backend/test_api.js
  ```

## 🎨 Paleta de Colores

El proyecto utiliza una paleta de colores eco-friendly:

```css
--verde-principal: #2e7d32
--verde-claro: #81c784
--verde-oscuro: #1b5e20
--beige: #f5f5dc
--marron: #5d4037
--blanco: #ffffff
```

## 🔒 Seguridad

- Contraseñas hasheadas con bcrypt (10 rondas de salt)
- Autenticación basada en JWT
- Validación de tokens en rutas protegidas
- CORS habilitado para desarrollo local

## 📄 Licencia

Este proyecto es de código abierto y está disponible para fines educativos.

## 👥 Contribuciones

Las contribuciones son bienvenidas. Por favor:

1. Fork el proyecto
2. Crea una rama para tu característica (`git checkout -b feature/AmazingFeature`)
3. Commit tus cambios (`git commit -m 'Add some AmazingFeature'`)
4. Push a la rama (`git push origin feature/AmazingFeature`)
5. Abre un Pull Request

## 📞 Soporte

Para reportar problemas o sugerir mejoras, por favor abre un issue en el repositorio de GitHub.

---

Desarrollado con 💚 para promover la educación ambiental y el reciclaje
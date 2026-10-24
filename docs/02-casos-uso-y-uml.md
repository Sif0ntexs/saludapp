# 2. Modelo UML — casos de uso, secuencia, actividad, estados y clases

Cada diagrama se entrega en **dos formatos** (misma semántica):
**Mermaid** (renderiza en GitHub/VS Code/Obsidian sin instalar nada) y
**PlantUML** (estándar académico; renderiza en plantuml.com o con la
extensión de VS Code).

Actores definidos en doc 01 §3. Requerimientos trazados en doc 01 §9.

---

## 2.1 Diagrama de casos de uso

### Mermaid

```mermaid
flowchart LR
  pac((Paciente))
  sys((Sistema))
  subgraph SaludApp
    cu1([CU-01 Agendar cita])
    cu2([CU-02 Gestionar estado de cita])
    cu3([CU-03 Atender cita])
    cu4([CU-04 Registrar consulta])
    cu5([CU-05 Consultar historial])
    cu6([CU-06 Derivar indicación a farmacia])
    cu7([CU-07 Gestionar farmacia])
    cu8([CU-08 Registrar toma])
    cu9([CU-09 Gestionar directorios])
    cu10([CU-10 Ver panel inicio])
    cu11([CU-11 Respaldar datos])
  end
  pac --> cu1 & cu2 & cu4 & cu5 & cu7 & cu10 & cu11
  sys --> cu3 & cu8 & cu9
  cu3 -.incluye.-> cu4
  cu6 -.incluye.-> cu7
  cu1 -.incluye.-> cu9
```

### PlantUML

```plantuml
@startuml
left to right direction
actor Paciente
actor Sistema

rectangle SaludApp {
  usecase "CU-01 Agendar cita" as CU1
  usecase "CU-02 Gestionar estado de cita" as CU2
  usecase "CU-03 Atender cita" as CU3
  usecase "CU-04 Registrar consulta" as CU4
  usecase "CU-05 Consultar historial" as CU5
  usecase "CU-06 Derivar indicación a farmacia" as CU6
  usecase "CU-07 Gestionar farmacia" as CU7
  usecase "CU-08 Registrar toma" as CU8
  usecase "CU-09 Gestionar directorios" as CU9
  usecase "CU-10 Ver panel de inicio" as CU10
  usecase "CU-11 Respaldar datos" as CU11
}

Paciente --> CU1
Paciente --> CU2
Paciente --> CU4
Paciente --> CU5
Paciente --> CU7
Paciente --> CU10
Paciente --> CU11
Sistema --> CU3
Sistema --> CU8
Sistema --> CU9
CU3 ..> CU4 : <<include>>
CU6 ..> CU7 : <<include>>
CU1 ..> CU9 : <<include>>
CU1 ..> CU2 : <<extend>> "confirma"
@enduml
```

### Casos de uso ampliados (los 3 principales)

**CU-01 Agendar cita (RF-01, RF-02, RF-14)**
| | |
|---|---|
| Actor | Paciente |
| Precondición | Saludo en Inicio; botón "Agendar cita" disponible |
| Flujo principal | 1) Toca **+ Agendar cita** · 2) Elige médico (existente o nuevo → CU-09) · 3) Elige especialidad · 4) Elige fecha/hora · 5) Ingresa consultorio · 6) Confirma · 7) El sistema valida traslape (RF-02) y guarda con estado `Programada` · 8) Inicio muestra la cita como "Próxima cita" |
| Flujo alternativo | 7a) Traslape detectado → error "Ya hay una cita con ese médico a esa hora" → vuelve a paso 4 |
| Postcondición | Cita persistida en `cita` (estado `Programada`) |

**CU-03 Atender cita (RF-05, RF-06)**
| | |
|---|---|
| Actor | Paciente (dispara), Sistema (crea consulta) |
| Precondición | Cita en `Programada` o `Confirmada` |
| Flujo principal | 1) Abre detalle de cita · 2) Toca **Marcar atendida** · 3) Sistema transiciona cita a `Atendida` (R1) · 4) Sistema abre formulario de consulta precargado (médico/especialidad/fecha) · 5) Paciente escribe motivo, **diagnóstico** e **indicaciones** · 6) Guarda (RF-06) → consulta queda vinculada 1:1 a la cita (R2) |
| Postcondición | `consulta` creada; cita `Atendida`; historial actualizado |

**CU-08 Registrar toma (RF-11, R3)**
| | |
|---|---|
| Actor | Paciente |
| Flujo principal | 1) En Farmacia toca **Tomar** en un medicamento activo · 2) Sistema valida stock > 0 (R3) · 3) Descuenta 1 a stock · 4) Registra `toma` con fecha-hora · 5) Actualiza adherencia del día |
| Alternativo | 2a) Stock 0 → aviso "sin existencias" + opción "sí tomar (marcado manual)" |

---

## 2.2 Diagramas de secuencia (3 flujos críticos)

### S1 — Agendar cita con validación de traslape

**Mermaid**
```mermaid
sequenceDiagram
  actor P as Paciente
  participant UI as Vista Citas
  participant DB as Capa DB
  participant VAL as Validador (R2)
  P->>UI: toca "+ Agendar cita"
  UI->>P: formulario (médico, fecha/hora, consultorio)
  P->>UI: confirma datos
  UI->>VAL: validar(medicoId, fechaHora)
  VAL->>DB: SELECT cita WHERE medicoId AND fechaHora solapa
  DB-->>VAL: []
  VAL-->>UI: OK
  UI->>DB: INSERT cita(estado='Programada')
  DB-->>UI: cita.id
  UI-->>P: confirmación + lista actualizada
  note over VAL,DB: alternativa: solapa → VAL rechaza y UI muestra error (RF-02)
```

**PlantUML**
```plantuml
@startuml
actor Paciente
participant "Vista Citas" as UI
participant "Capa DB" as DB
participant "Validador" as VAL

Paciente -> UI : + Agendar cita
UI -> Paciente : formulario
Paciente -> UI : confirma
UI -> VAL : validar(medico, fechaHora)
VAL -> DB : SELECT traslape
alt sin traslapo
  DB --> VAL : vacio
  VAL --> UI : OK
  UI -> DB : INSERT cita Programada
  DB --> UI : cita.id
  UI --> Paciente : confirmacion
else traslapo
  DB --> VAL : conflicto
  VAL --> UI : ERROR
  UI --> Paciente : "Ya existe cita a esa hora"
end
@enduml
```

### S2 — Atender cita y registrar consulta (diagnóstico + indicaciones)

**Mermaid**
```mermaid
sequenceDiagram
  actor P as Paciente
  participant UI as Detalle de cita
  participant SYS as Sistema (CU-03)
  participant DB as Capa DB
  P->>UI: "Marcar atendida"
  UI->>SYS: atender(citaId)
  SYS->>DB: UPDATE cita SET estado='Atendida' (R1)
  SYS-->>P: formulario de consulta precargado
  P->>SYS: motivo + diagnostico + indicaciones
  SYS->>DB: INSERT consulta (vínculo citaId única, R2)
  SYS->>DB: INSERT indicaciones (si se derivan → CU-06/RF-09)
  DB-->>SYS: ok
  SYS-->>P: historial actualizado
```

### S3 — Registrar toma y descontar stock

**Mermaid**
```mermaid
sequenceDiagram
  actor P as Paciente
  participant UI as Farmacia
  participant DB as Capa DB
  P->>UI: toca "Tomar" (medicamento)
  UI->>DB: SELECT stock
  alt stock > 0 (R3)
    DB-->>UI: stock
    UI->>DB: UPDATE medicamento SET stock = stock - 1
    UI->>DB: INSERT toma(fechaHora)
    UI-->>P: adherencia del día +1, stock visible
  else stock = 0
    DB-->>UI: 0
    UI-->>P: aviso "sin existencias" + confirmación manual (RF-12 chip "Stock bajo")
  end
```

---

## 2.3 Diagrama de actividad — flujo integral de una consulta

**Mermaid**
```mermaid
flowchart TD
  A([Inicio]) --> B{¿Cita existente?}
  B -- sí --> C[Seleccionar cita]
  B -- no --> D[Agendar cita CU-01]
  D --> C
  C --> E{Estado de cita}
  E -- Programada --> F[Confirmar RF-03]
  E -- Confirmada --> G
  F --> G[Marcar atendida]
  G --> H[Formulario consulta precargado]
  H --> I{Datos mínimos válidos?\\nmotivo + diagnóstico}
  I -- no --> H
  I -- sí --> J[Guardar consulta RF-06]
  J --> K{¿Prescribió medicina?}
  K -- sí --> L[Crear medicamento en farmacia RF-09]
  K -- no --> M
  L --> M([Fin: historial y farmacia actualizados])
```

**PlantUML (equivalente resumido)**
```plantuml
@startuml
start
:Seleccionar o agendar cita;
if (¿confirma cita?) then (sí)
  :estado Confirmada;
endif
:Marcar atendida;
repeat
  :Formulario consulta;
  repeat while (¿motivo+diagnóstico válidos?) is (no) not (sí)
:Guardar consulta;
if (¿medicina prescrita?) then (sí)
  :Agregar medicamento a farmacia;
endif
stop
@enduml
```

---

## 2.4 Diagrama de estados — Ciclo de vida de la Cita (R1)

**Mermaid**
```mermaid
stateDiagram-v2
  [*] --> Programada : RF-01 agendar
  Programada --> Confirmada : RF-03 confirmar
  Programada --> Cancelada : RF-03 cancelar
  Confirmada --> Cancelada : RF-03 cancelar
  Programada --> Atendida : RF-05 marcar atendida + crea consulta
  Confirmada --> Atendida : RF-05 marcar atendida + crea consulta
  Atendida --> [*]
  Cancelada --> [*]
```

**PlantUML**
```plantuml
@startuml
[*] --> Programada
Programada --> Confirmada : confirmar
Programada --> Cancelada : cancelar
Confirmada --> Cancelada : cancelar
Programada --> Atendida : atender (crea consulta)
Confirmada --> Atendida : atender (crea consulta)
Atendida --> [*]
Cancelada --> [*]
@enduml
```

---

## 2.5 Diagrama de clases

Notas: la app instancia este modelo en el dispositivo (v3 del doc 03).
`consulta` y `cita` comparten `medicoId`; el vínculo cita→consulta es 1:1
única. Navegación y estados según R1.

**Mermaid**
```mermaid
classDiagram
  class Paciente {
    +id : string
    +nombre : string
    +generarRespaldo() JSON
  }
  class Medico {
    +id : string
    +nombre : string
    +consultorio : string
    +telefono : string
  }
  class Especialidad {
    +id : string
    +nombre : string
  }
  class Cita {
    +id : string
    +fechaHora : datetime
    +estado : EstadoCita
    +consultorio : string
    +validarTraslape() bool
    +transicionar(nuevoEstado) void
  }
  class Consulta {
    +id : string
    +fecha : date
    +motivo : string
    +diagnostico : string
    +indicaciones : string
    +observaciones : string
  }
  class Medicamento {
    +id : string
    +nombre : string
    +presentacion : string
    +dosis : string
    +frecuenciaHoras : int
    +stock : int
    +suspendido : bool
    +estaActivo() bool
    +descontarStock() void
  }
  class Toma {
    +id : string
    +fechaHora : datetime
    +confirmadaManual : bool
  }

  Especialidad "1" --> "0..*" Medico : clasifica
  Medico "1" --> "0..*" Cita : atiende
  Medico "1" --> "0..*" Consulta : registra
  Cita "0..1" --> "0..1" Consulta : deriva (1:1 única)
  Consulta "1" --> "0..*" Medicamento : prescribe
  Medicamento "1" --> "0..*" Toma : registra
```

**PlantUML**
```plantuml
@startuml
class Paciente { +id; +nombre; +generarRespaldo() }
class Medico { +id; +nombre; +consultorio; +telefono }
class Especialidad { +id; +nombre }
class Cita { +id; +fechaHora; +estado; +consultorio; +validarTraslape(); +transicionar() }
class Consulta { +id; +fecha; +motivo; +diagnostico; +indicaciones; +observaciones }
class Medicamento { +id; +nombre; +presentacion; +dosis; +stock; +suspendido; +estaActivo(); +descontarStock() }
class Toma { +id; +fechaHora; +confirmadaManual }

Especialidad "1" -- "0..*" Medico
Medico "1" -- "0..*" Cita
Medico "1" -- "0..*" Consulta
Cita "0..1" -- "0..1" Consulta : deriva 1:1
Consulta "1" -- "0..*" Medicamento : prescribe
Medicamento "1" -- "0..*" Toma
@enduml
```

---

## 2.6 Resumen de cobertura

| Diagrama | Cubre |
|---|---|
| Casos de uso | RF-01…RF-18 (todos los actores y relaciones include/extend) |
| Secuencias | S1 agendar/validar (RF-01/02/14) · S2 atender/diagnosticar (RF-05/06) · S3 toma/stock (RF-11/12/R3) |
| Actividad | Recorrido completo cita→consulta→farmacia |
| Estados | R1 ciclo de vida de cita |
| Clases | 7 entidades de doc 03 + responsabilidades |

-- =====================================================================
-- SISTEMA DE GESTÃO DE FROTA VEICULAR — Supabase
-- =====================================================================

-- 1) Criar a tabela de veículos
CREATE TABLE IF NOT EXISTS veiculos (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  modelo        TEXT NOT NULL,
  placa         TEXT NOT NULL UNIQUE,
  marca         TEXT NOT NULL,
  ano           INTEGER NOT NULL,
  status        TEXT DEFAULT 'Ativo'
                CHECK (status IN ('Ativo', 'Manutenção', 'Inativo')),
  data_cadastro TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

-- 2) Dados iniciais
INSERT INTO veiculos (modelo, placa, marca, ano, status)
VALUES
  ('Volvo FH 540',          'ABC-1234', 'Volvo',    2023, 'Ativo'),
  ('Mercedes-Benz Actros',  'XYZ-5678', 'Mercedes', 2022, 'Manutenção'),
  ('Scania R450',            'DBA-9012', 'Scania',   2021, 'Ativo')
ON CONFLICT (placa) DO NOTHING;

-- 3) Ativar RLS
ALTER TABLE veiculos ENABLE ROW LEVEL SECURITY;

-- Remover políticas antigas, caso existam
DROP POLICY IF EXISTS "Acesso público de leitura" ON veiculos;
DROP POLICY IF EXISTS "Acesso público de inserção" ON veiculos;
DROP POLICY IF EXISTS "Acesso público de atualização" ON veiculos;
DROP POLICY IF EXISTS "Acesso público de exclusão" ON veiculos;

-- 4) Criar políticas
CREATE POLICY "Acesso público de leitura"
ON veiculos
FOR SELECT
USING (true);

CREATE POLICY "Acesso público de inserção"
ON veiculos
FOR INSERT
WITH CHECK (true);

CREATE POLICY "Acesso público de atualização"
ON veiculos
FOR UPDATE
USING (true)
WITH CHECK (true);

CREATE POLICY "Acesso público de exclusão"
ON veiculos
FOR DELETE
USING (true);

-- 5) Verificação
SELECT * FROM veiculos
ORDER BY data_cadastro DESC;
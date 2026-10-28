-- Garante RLS ativado
ALTER TABLE veiculos ENABLE ROW LEVEL SECURITY;

-- Permite leitura/escrita para usuários autenticados
CREATE POLICY "Acesso autenticado"
ON veiculos
FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);

BEGIN;

SELECT set_config('app.user_id','00000000-0000-0000-0000-000000000001',true), set_config('app.user_role','owner',true);

INSERT INTO app.users(id,email,display_name,password_hash,role) VALUES
  ('10000000-0000-0000-0000-000000000001','p9-finance@example.test','P9 Finance','test','finance'),
  ('10000000-0000-0000-0000-000000000002','p9-warehouse@example.test','P9 Warehouse','test','warehouse'),
  ('10000000-0000-0000-0000-000000000003','p9-cashier@example.test','P9 Cashier','test','cashier');
INSERT INTO app.product_categories(id,name,slug) VALUES ('20000000-0000-0000-0000-000000000001','P9 Category','p9-category');
INSERT INTO app.products(id,part_code,name,category_id,het,hpp) VALUES ('30000000-0000-0000-0000-000000000001','P9-PART','P9 Part','20000000-0000-0000-0000-000000000001',20000,10000);
INSERT INTO app.warehouses(id,code,name) VALUES ('40000000-0000-0000-0000-000000000001','P9','P9 Warehouse');
INSERT INTO app.inventory_balances(warehouse_id,product_id,quantity) VALUES ('40000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001',10);
INSERT INTO app.customers(id,name,phone) VALUES ('50000000-0000-0000-0000-000000000001','P9 Customer','089900000001');
INSERT INTO app.customer_vehicles(id,customer_id,plate_number) VALUES ('60000000-0000-0000-0000-000000000001','50000000-0000-0000-0000-000000000001','P901TEST');
INSERT INTO app.service_orders(id,order_number,customer_id,vehicle_id,status,complaint,opened_at) VALUES
  ('70000000-0000-0000-0000-000000000001','P9-SO-FINANCE','50000000-0000-0000-0000-000000000001','60000000-0000-0000-0000-000000000001','quality_check','Finance guard',now()),
  ('70000000-0000-0000-0000-000000000002','P9-SO-WAREHOUSE','50000000-0000-0000-0000-000000000001','60000000-0000-0000-0000-000000000001','in_progress','Warehouse guard',now()),
  ('70000000-0000-0000-0000-000000000003','P9-SO-HANDOVER','50000000-0000-0000-0000-000000000001','60000000-0000-0000-0000-000000000001','paid','Handover guard',now());
INSERT INTO app.service_order_parts(id,service_order_id,product_id,warehouse_id,quantity,unit_price,unit_cost) VALUES
  ('80000000-0000-0000-0000-000000000001','70000000-0000-0000-0000-000000000002','30000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000001',1,20000,10000);
INSERT INTO app.service_order_exit_checklists(service_order_id,vehicle_checked,belongings_returned,keys_returned,work_explained,confirmed_by)
VALUES ('70000000-0000-0000-0000-000000000003',true,true,true,true,'10000000-0000-0000-0000-000000000003');
INSERT INTO app.service_order_handover_assets(id,service_order_id,kind,mime_type,content,sha256,uploaded_by)
VALUES
  ('90000000-0000-0000-0000-000000000001','70000000-0000-0000-0000-000000000003','signature','image/png',decode(repeat('00',32),'hex'),repeat('a',64),'10000000-0000-0000-0000-000000000003'),
  ('90000000-0000-0000-0000-000000000002','70000000-0000-0000-0000-000000000003','final_photo','image/png',decode(repeat('00',32),'hex'),repeat('b',64),'10000000-0000-0000-0000-000000000003');
UPDATE app.service_orders SET status='completed',handed_over_at=now(),handed_over_by='10000000-0000-0000-0000-000000000003',handover_signature_reference='/api/v1/operations/service-orders/70000000-0000-0000-0000-000000000003/handover-assets/90000000-0000-0000-0000-000000000001',completed_at=now()
WHERE id='70000000-0000-0000-0000-000000000003';

INSERT INTO app.pos_registers(id,code,name,warehouse_id) VALUES ('a0000000-0000-0000-0000-000000000001','P9','P9 Register','40000000-0000-0000-0000-000000000001');
INSERT INTO app.pos_sales(id,sale_number,register_id,warehouse_id,cashier_id,cashier_name,subtotal,total,paid_amount,idempotency_key,request_hash)
VALUES ('b0000000-0000-0000-0000-000000000001','P9-POS','a0000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000003','P9 Cashier',20000,20000,20000,'p9-pos-sale',repeat('b',64));
INSERT INTO app.customer_invoices(id,invoice_number,service_order_id,customer_id,status,subtotal,created_by)
VALUES ('c0000000-0000-0000-0000-000000000001','P9-INVOICE','70000000-0000-0000-0000-000000000001','50000000-0000-0000-0000-000000000001','posted',20000,'10000000-0000-0000-0000-000000000003');

SET LOCAL ROLE honda_runtime;

SELECT set_config('app.user_id','10000000-0000-0000-0000-000000000001',true), set_config('app.user_role','finance',true);
DO $$ BEGIN
  BEGIN
    UPDATE app.service_orders SET diagnosis='forbidden' WHERE id='70000000-0000-0000-0000-000000000001';
    RAISE EXCEPTION 'finance changed non-finance workflow state';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  UPDATE app.service_orders SET status='invoiced',updated_by='10000000-0000-0000-0000-000000000001',updated_at=now() WHERE id='70000000-0000-0000-0000-000000000001';
  IF NOT FOUND THEN RAISE EXCEPTION 'finance invoice transition blocked'; END IF;
END $$;

SELECT set_config('app.user_id','10000000-0000-0000-0000-000000000002',true), set_config('app.user_role','warehouse',true);
DO $$ BEGIN
  UPDATE app.service_order_parts SET quantity=2 WHERE id='80000000-0000-0000-0000-000000000001';
  IF NOT FOUND THEN RAISE EXCEPTION 'warehouse active part update blocked'; END IF;
  BEGIN
    UPDATE app.service_order_parts SET unit_cost=1 WHERE id='80000000-0000-0000-0000-000000000001';
    RAISE EXCEPTION 'warehouse changed part cost';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END $$;
RESET ROLE;
UPDATE app.service_order_parts SET consumed_at=now() WHERE id='80000000-0000-0000-0000-000000000001';
SET LOCAL ROLE honda_runtime;
SELECT set_config('app.user_id','10000000-0000-0000-0000-000000000002',true), set_config('app.user_role','warehouse',true);
DO $$ BEGIN
  UPDATE app.service_order_parts SET quantity=3 WHERE id='80000000-0000-0000-0000-000000000001';
  IF FOUND THEN RAISE EXCEPTION 'warehouse changed consumed part'; END IF;
END $$;

SELECT set_config('app.user_id','10000000-0000-0000-0000-000000000003',true), set_config('app.user_role','cashier',true);
INSERT INTO app.payments(payment_number,direction,customer_invoice_id,amount,method,received_by,idempotency_key)
VALUES ('P9-SERVICE-PAYMENT','incoming','c0000000-0000-0000-0000-000000000001',20000,'cash','10000000-0000-0000-0000-000000000003','p9-service-payment');
DO $$ DECLARE visible integer; BEGIN
  SELECT count(*) INTO visible FROM app.service_order_handover_assets WHERE id='90000000-0000-0000-0000-000000000001';
  IF visible <> 1 THEN RAISE EXCEPTION 'handover asset read unexpectedly blocked'; END IF;
  UPDATE app.service_order_handover_assets SET sha256=repeat('c',64) WHERE id='90000000-0000-0000-0000-000000000001';
  IF FOUND THEN RAISE EXCEPTION 'completed handover asset remained mutable'; END IF;
  UPDATE app.service_order_exit_checklists SET notes='forbidden' WHERE service_order_id='70000000-0000-0000-0000-000000000003';
  IF FOUND THEN RAISE EXCEPTION 'completed handover checklist remained mutable'; END IF;
  BEGIN
    INSERT INTO app.service_order_handover_assets(service_order_id,kind,mime_type,content,sha256,uploaded_by)
    VALUES ('70000000-0000-0000-0000-000000000003','final_photo','image/png',decode(repeat('00',32),'hex'),repeat('d',64),'10000000-0000-0000-0000-000000000003');
    RAISE EXCEPTION 'completed handover accepted new asset';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END $$;

INSERT INTO app.pos_sale_payments(sale_id,method,amount,received_by,idempotency_key)
VALUES ('b0000000-0000-0000-0000-000000000001','cash',20000,'10000000-0000-0000-0000-000000000003','p9-pos-payment');
INSERT INTO app.stock_movements(warehouse_id,product_id,movement_type,quantity,unit_cost,reference_type,reference_id,idempotency_key,reason,actor_id)
VALUES ('40000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','adjustment_out',-1,10000,'pos_sale','b0000000-0000-0000-0000-000000000001','p9-pos-stock','P9 regression','10000000-0000-0000-0000-000000000003');
DO $$ DECLARE quantity numeric; BEGIN
  SELECT b.quantity INTO quantity FROM app.inventory_balances b WHERE b.warehouse_id='40000000-0000-0000-0000-000000000001' AND b.product_id='30000000-0000-0000-0000-000000000001';
  IF quantity <> 9 THEN RAISE EXCEPTION 'cashier POS stock path broken: %', quantity; END IF;
END $$;

ROLLBACK;

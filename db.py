import mysql.connector
from mysql.connector import Error
from contextlib import contextmanager

class Database:
    def __init__(self):
        self.config = {
            'host': 'localhost',
            'user': 'root',
            'password': 'password',  # Change this
            'database': 'invoice_hub'
        }
    
    @contextmanager
    def get_connection(self):
        conn = None
        try:
            conn = mysql.connector.connect(**self.config)
            conn.autocommit = False  # Manual transaction control
            yield conn
            conn.commit()
        except Error as e:
            if conn:
                conn.rollback()
            raise e
        finally:
            if conn and conn.is_connected():
                conn.close()
    
    def get_client_id(self, client_name):
        with self.get_connection() as conn:
            cursor = conn.cursor(dictionary=True)
            cursor.execute("SELECT id FROM clients WHERE LOWER(name) = LOWER(%s)", (client_name,))
            result = cursor.fetchone()
            if result:
                return result['id']
            
            cursor.execute("INSERT INTO clients (name) VALUES (%s)", (client_name,))
            return cursor.lastrowid
    
    def get_item_id(self, item_name, gst_percentage):
        with self.get_connection() as conn:
            cursor = conn.cursor(dictionary=True)
            cursor.execute("SELECT id FROM items WHERE LOWER(name) = LOWER(%s)", (item_name,))
            result = cursor.fetchone()
            if result:
                return result['id']
            
            cursor.execute("INSERT INTO items (name, gst_percentage) VALUES (%s, %s)", 
                         (item_name, gst_percentage))
            return cursor.lastrowid
    
    def create_invoice(self, client_name, items_data):
        conn = None
        try:
            conn = mysql.connector.connect(**self.config)
            conn.autocommit = False
            cursor = conn.cursor()
            
            # Get or create client
            cursor.execute("SELECT id FROM clients WHERE LOWER(name) = LOWER(%s)", (client_name,))
            result = cursor.fetchone()
            if not result:
                cursor.execute("INSERT INTO clients (name) VALUES (%s)", (client_name,))
                client_id = cursor.lastrowid
            else:
                client_id = result[0]
            
            # Generate invoice number
            cursor.execute("SELECT COUNT(*) FROM invoices")
            count = cursor.fetchone()[0] + 1
            invoice_number = f"INV-{count:04d}"
            invoice_date = "2025-12-19"
            
            subtotal = sum(item['item_total'] for item in items_data)
            total_gst = sum(item['gst_amount'] for item in items_data)
            grand_total = subtotal + total_gst
            
            # Insert invoice
            cursor.execute("""
                INSERT INTO invoices (invoice_number, client_id, invoice_date, subtotal, total_gst, grand_total)
                VALUES (%s, %s, %s, %s, %s, %s)
            """, (invoice_number, client_id, invoice_date, subtotal, total_gst, grand_total))
            
            invoice_id = cursor.lastrowid
            
            # Insert invoice items
            for item_data in items_data:
                cursor.execute("SELECT id FROM items WHERE LOWER(name) = LOWER(%s)", (item_data['name'],))
                result = cursor.fetchone()
                if not result:
                    cursor.execute("INSERT INTO items (name, gst_percentage) VALUES (%s, %s)", 
                                 (item_data['name'], item_data['gst_percentage']))
                    item_id = cursor.lastrowid
                else:
                    item_id = result[0]
                
                cursor.execute("""
                    INSERT INTO invoice_items (invoice_id, item_id, quantity, unit_price, gst_percentage, item_total)
                    VALUES (%s, %s, %s, %s, %s, %s)
                """, (invoice_id, item_id, item_data['quantity'], item_data['unit_price'], 
                      item_data['gst_percentage'], item_data['item_total']))
            
            conn.commit()
            
            return {
                'id': invoice_id,
                'invoice_number': invoice_number,
                'client_id': client_id,
                'subtotal': float(subtotal),
                'total_gst': float(total_gst),
                'grand_total': float(grand_total)
            }
        except Error as e:
            if conn:
                conn.rollback()
            raise e
        finally:
            if conn and conn.is_connected():
                conn.close()
    
    def get_invoices(self):
        with self.get_connection() as conn:
            cursor = conn.cursor(dictionary=True)
            cursor.execute("""
                SELECT i.*, c.name as client_name, i.grand_total
                FROM invoices i
                JOIN clients c ON i.client_id = c.id
                ORDER BY i.created_at DESC
                LIMIT 10
            """)
            return cursor.fetchall()
    
    def get_invoice(self, invoice_id):
        with self.get_connection() as conn:
            cursor = conn.cursor(dictionary=True)
            cursor.execute("""
                SELECT i.*, c.name as client_name
                FROM invoices i
                JOIN clients c ON i.client_id = c.id
                WHERE i.id = %s
            """, (invoice_id,))
            invoice = cursor.fetchone()
            
            if invoice:
                cursor.execute("""
                    SELECT ii.*, it.name as item_name, it.gst_percentage
                    FROM invoice_items ii
                    JOIN items it ON ii.item_id = it.id
                    WHERE ii.invoice_id = %s
                """, (invoice_id,))
                invoice['items'] = cursor.fetchall()
            
            return invoice
    
    def get_clients(self):
        with self.get_connection() as conn:
            cursor = conn.cursor(dictionary=True)
            cursor.execute("SELECT id, name, created_at FROM clients ORDER BY name")
            return cursor.fetchall()
    
    def get_items(self):
        with self.get_connection() as conn:
            cursor = conn.cursor(dictionary=True)
            cursor.execute("SELECT id, name, gst_percentage, created_at FROM items ORDER BY name")
            return cursor.fetchall()
    
    def get_dashboard_stats(self):
        with self.get_connection() as conn:
            cursor = conn.cursor(dictionary=True)
            
            cursor.execute("SELECT COUNT(*) as total_invoices FROM invoices")
            total_invoices = cursor.fetchone()['total_invoices']
            
            cursor.execute("SELECT COALESCE(SUM(grand_total), 0) as total_revenue FROM invoices")
            total_revenue = cursor.fetchone()['total_revenue']
            
            cursor.execute("SELECT COALESCE(SUM(grand_total), 0) as pending_amount FROM invoices WHERE status = 'pending'")
            pending_amount = cursor.fetchone()['pending_amount']
            
            return {
                'total_invoices': total_invoices,
                'total_revenue': float(total_revenue),
                'pending_amount': float(pending_amount)
            }

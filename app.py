from flask import Flask, request, jsonify
from flask_cors import CORS
from db import Database
import re

app = Flask(__name__)
CORS(app)
db = Database()

@app.route('/api/invoices', methods=['POST'])
def create_invoice():
    data = request.json
    result = db.create_invoice(data['client_name'], data['items'])
    return jsonify(result), 201

@app.route('/api/invoices', methods=['GET'])
def list_invoices():
    invoices = db.get_invoices()
    return jsonify(invoices)

@app.route('/api/invoices/<int:id>', methods=['GET'])
def get_invoice(id):
    invoice = db.get_invoice(id)
    if not invoice:
        return jsonify({'error': 'Invoice not found'}), 404
    return jsonify(invoice)

@app.route('/api/clients', methods=['GET'])
def list_clients():
    clients = db.get_clients()
    return jsonify(clients)

@app.route('/api/items', methods=['GET'])
def list_items():
    items = db.get_items()
    return jsonify(items)

@app.route('/api/dashboard', methods=['GET'])
def dashboard_stats():
    stats = db.get_dashboard_stats()
    return jsonify(stats)

if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5000)


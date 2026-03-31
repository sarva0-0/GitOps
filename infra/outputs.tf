output "master_public_ip" {
  value = aws_eip.master.public_ip
}

output "worker_public_ips" {
  value = aws_eip.workers[*].public_ip
}
